"""Exercise the status route with deterministic regular and batched generators."""
import asyncio
import logging
import sys
import tempfile
import unittest
from pathlib import Path
from threading import Event, Thread
from types import SimpleNamespace
from unittest.mock import Mock, patch

import app


class ProgressiveStatusTest(unittest.TestCase):
    def test_completed_segments_are_visible_before_the_generator_finishes(self):
        for batch_size in (1, 4):
            with self.subTest(batch_size=batch_size):
                self.check_status(batch_size)

    def check_status(self, batch_size):
        waiting = Event()
        resume = Event()
        first = SimpleNamespace(start=0.0, end=2.0, text="First passage")
        last = SimpleNamespace(start=2.0, end=5.0, text="Last passage")

        def segments():
            yield first
            waiting.set()
            if not resume.wait(5):
                raise RuntimeError("Status check did not finish")
            yield last

        model = Mock()
        model.transcribe.return_value = segments(), SimpleNamespace(duration=5.0, language="en")
        with tempfile.TemporaryDirectory() as temp:
            recording = Path(temp, "fixture.wav")
            recording.touch()
            job = {
                "key": "test-job", "path": recording, "state": "queued",
                "model": "test-model", "vad": True, "word_timestamps": False,
                "cancel": Event(), "segments": [],
            }
            with (
                patch.object(app, "JOBS", {job["key"]: job}),
                patch.object(app, "TOKEN", ""),
                patch.object(app, "BATCH_SIZE", batch_size),
                patch.object(app, "load", return_value=model if batch_size == 1 else Mock()),
                patch.object(app, "load_batched", return_value=model),
            ):
                worker = Thread(target=app._run_job, args=(job,))
                worker.start()
                try:
                    self.assertTrue(waiting.wait(5))
                    draft = asyncio.run(app.get_job(job["key"], authorization=None))
                    self.assertEqual(draft["state"], "transcribing")
                    self.assertEqual(draft["segments"], [vars(first)])
                    self.assertEqual(draft["duration"], 5.0)
                    self.assertEqual(draft["processed"], 2.0)
                    self.assertEqual(draft["progress"], 0.4)
                finally:
                    resume.set()
                    worker.join(5)

                ready = asyncio.run(app.get_job(job["key"], authorization=None))
                self.assertEqual(ready["state"], "ready")
                self.assertEqual(ready["result"]["segments"], [vars(first), vars(last)])
                self.assertEqual(draft["segments"], [vars(first)])
                self.assertEqual(model.transcribe.call_args.kwargs.get("batch_size"), batch_size if batch_size > 1 else None)


def timed(start, end, text, *words):
    return SimpleNamespace(
        start=start, end=end, text=text,
        words=[SimpleNamespace(start=a, end=b, word=w) for a, b, w in words],
    )


TURNS = [
    {"start": 0.0, "end": 4.0, "speaker": "SPEAKER_00"},
    {"start": 4.0, "end": 12.0, "speaker": "SPEAKER_01"},
]
SEGMENTS = [
    timed(0.5, 3.5, " Did you expect that?", (0.5, 1.5, " Did"), (1.5, 2.5, " you"), (2.5, 3.5, " expect that?")),
    # One Whisper segment spanning the speaker change at 4.0s.
    timed(3.0 + 0.6, 8.0, " Honestly no. Not at all.", (4.6, 5.5, " Honestly"), (5.5, 6.5, " no."), (6.5, 7.2, " Not"), (7.2, 8.0, " at all.")),
]


def run_diarized_job(*, segments=SEGMENTS, turns=TURNS, hints=None, diarizer=None, loader=None, token="", gate=None):
    """Run one job with a fake diarizer and Whisper; return (job, states seen, model mock)."""
    states: list[tuple[str, str, float | None]] = []

    def segment_iter():
        for index, segment in enumerate(segments):
            if gate and index == 1:
                gate()
            yield segment

    model = Mock()
    model.transcribe.return_value = segment_iter(), SimpleNamespace(duration=12.0, language="en")
    with tempfile.TemporaryDirectory() as temp:
        recording = Path(temp, "fixture.wav")
        recording.touch()
        job = {
            "key": "diarized", "path": recording, "state": "queued", "model": "test-model", "vad": True,
            "word_timestamps": False, "diarize": True, "speaker_hints": hints or {}, "cancel": Event(), "segments": [],
        }
        original = app._set_job

        def spy(target, **changes):
            original(target, **changes)
            if "state" in changes or "progress" in changes:
                states.append((target["state"], target.get("message", ""), target.get("progress")))

        def default_diarizer(path, pipeline, given, on_progress, cancelled):
            on_progress(0.5)
            return turns

        with (
            patch.object(app, "JOBS", {job["key"]: job}),
            patch.object(app, "BATCH_SIZE", 1),
            patch.object(app, "DIARIZATION_ENABLED", True),
            patch.object(app, "DIARIZATION_TOKEN", token),
            patch.object(app, "load", return_value=model),
            patch.object(app, "load_diarizer", loader or Mock(return_value=object())),
            patch.object(app, "diarize_recording", diarizer or default_diarizer),
            patch.object(app, "_set_job", spy),
        ):
            app._run_job(job)
    return job, states, model


class DiarizedJobTest(unittest.TestCase):
    def test_stages_run_in_order_and_the_transcript_carries_speakers(self):
        job, states, model = run_diarized_job()
        order = []
        for state, _message, _progress in states:
            if not order or order[-1] != state:
                order.append(state)
        self.assertEqual(order, ["loading-diarization", "diarizing", "loading-model", "transcribing", "ready"])
        self.assertIn(("diarizing", "Identifying speakers", 0.5), states)
        # Diarization turns word timing on even though the job did not ask for it.
        self.assertIs(model.transcribe.call_args.kwargs["word_timestamps"], True)
        segments = job["result"]["segments"]
        self.assertEqual([s["speaker"] for s in segments], ["SPEAKER_00", "SPEAKER_01"])
        self.assertEqual(segments[1]["text"], "Honestly no. Not at all.")

    def test_a_segment_across_the_boundary_is_split_in_the_progressive_prefix(self):
        waiting, resume = Event(), Event()
        crossing = [
            timed(1.0, 6.0, " Did you? Yes.", (1.0, 3.0, " Did"), (3.0, 3.9, " you?"), (4.2, 5.0, " Yes."), (5.0, 6.0, " Sure.")),
            timed(7.0, 9.0, " Later.", (7.0, 9.0, " Later.")),
        ]

        def gate():
            waiting.set()
            if not resume.wait(5):
                raise RuntimeError("never resumed")

        result = {}
        worker = Thread(target=lambda: result.update(zip(("job", "states", "model"), run_diarized_job(segments=crossing, gate=gate))))
        worker.start()
        try:
            self.assertTrue(waiting.wait(5))
            with patch.object(app, "TOKEN", ""):
                # The job dict is only reachable through JOBS while it runs.
                draft = next(iter(app.JOBS.values()))["segments"][:]
        finally:
            resume.set()
            worker.join(5)
        self.assertEqual([(s["speaker"], s["text"]) for s in draft], [("SPEAKER_00", "Did you?"), ("SPEAKER_01", "Yes. Sure.")])
        final = result["job"]["result"]["segments"]
        # The partial prefix and the final result attribute the same words identically.
        self.assertEqual(final[: len(draft)], draft)
        self.assertEqual(final[-1]["speaker"], "SPEAKER_01")

    def test_a_replayed_job_gives_the_same_segments_not_duplicates(self):
        first, _, _ = run_diarized_job()
        second, _, _ = run_diarized_job()
        self.assertEqual(first["result"]["segments"], second["result"]["segments"])
        self.assertEqual(len(second["result"]["segments"]), 2)

    def test_speaker_hints_reach_the_diarizer_and_an_exact_count_wins(self):
        seen = {}

        def diarizer(path, pipeline, hints, on_progress, cancelled):
            seen.update(hints)
            return TURNS

        run_diarized_job(hints=app._speaker_hints(3, 2, 4), diarizer=diarizer)
        self.assertEqual(seen, {"num_speakers": 3})
        self.assertEqual(app._speaker_hints(None, 2, 4), {"min_speakers": 2, "max_speakers": 4})
        self.assertEqual(app._speaker_hints(None, 5, 2), {})  # contradictory range → automatic
        self.assertEqual(app._speaker_hints(None, None, None), {})  # automatic by default
        self.assertEqual(app._speaker_hints(99, None, None), {})

    def test_unmatched_timing_has_no_speaker(self):
        silent = [timed(40.0, 42.0, " Out of range.", (40.0, 42.0, " Out of range."))]
        job, _, _ = run_diarized_job(segments=silent)
        self.assertEqual(job["result"]["segments"], [{"start": 40.0, "end": 42.0, "text": "Out of range."}])

    def test_cancellation_during_speaker_identification_stops_before_whisper(self):
        def diarizer(path, pipeline, hints, on_progress, cancelled):
            raise app.diarization.DiarizationCancelled()

        job, _, model = run_diarized_job(diarizer=diarizer)
        self.assertEqual(job["state"], "cancelled")
        model.transcribe.assert_not_called()


class DiarizationDisabledTest(unittest.TestCase):
    def test_segment_only_mode_needs_no_pyannote_or_token(self):
        self.assertNotIn("pyannote", sys.modules)
        self.assertNotIn("torch", sys.modules)
        model = Mock()
        model.transcribe.return_value = iter([SimpleNamespace(start=0.0, end=2.0, text="Plain.")]), SimpleNamespace(duration=2.0, language="en")
        with tempfile.TemporaryDirectory() as temp:
            recording = Path(temp, "fixture.wav")
            recording.touch()
            job = {"key": "plain", "path": recording, "state": "queued", "model": "m", "vad": True, "word_timestamps": False, "cancel": Event(), "segments": []}
            with (
                patch.object(app, "JOBS", {"plain": job}),
                patch.object(app, "BATCH_SIZE", 1),
                patch.object(app, "DIARIZATION_ENABLED", False),
                patch.object(app, "load", return_value=model),
                patch.object(app, "load_diarizer", side_effect=AssertionError("must not load")),
            ):
                app._run_job(job)
        self.assertIs(model.transcribe.call_args.kwargs["word_timestamps"], False)
        self.assertEqual(job["result"]["segments"], [{"start": 0.0, "end": 2.0, "text": "Plain."}])

    def test_a_job_cannot_force_diarization_on_when_the_service_has_it_off(self):
        with patch.object(app, "DIARIZATION_ENABLED", False):
            self.assertFalse(app._should_diarize(True))
            self.assertFalse(app._should_diarize(None))
        with patch.object(app, "DIARIZATION_ENABLED", True):
            self.assertTrue(app._should_diarize(None))
            self.assertFalse(app._should_diarize(False))  # a job may opt out


class TokenSecrecyTest(unittest.TestCase):
    SECRET = "hf_secret_token_value_123"

    def test_health_jobs_and_logs_never_contain_the_token(self):
        class Leaky(Exception):
            pass

        def loader():
            raise Leaky(f"401 for Authorization: Bearer {self.SECRET}")

        with self.assertLogs(level=logging.DEBUG) as captured:
            logging.getLogger("test").debug("keep assertLogs satisfied")
            job, _, _ = run_diarized_job(loader=loader, token=self.SECRET)
            with (
                patch.object(app, "DIARIZATION_TOKEN", self.SECRET),
                patch.object(app, "DIARIZATION_ENABLED", True),
                patch.object(app, "JOBS", {job["key"]: job}),
                patch.object(app, "TOKEN", ""),
            ):
                health = asyncio.run(app.health())
                status = asyncio.run(app.get_job(job["key"], authorization=None))
        self.assertEqual(job["state"], "failed")
        self.assertTrue(health["diarization"])
        self.assertEqual(health["diarization_model"], app.DIARIZATION_MODEL)
        for surface in (repr(health), repr(status), repr(job["detail"]), "\n".join(captured.output)):
            self.assertNotIn(self.SECRET, surface)
        self.assertNotIn("Leaky: 401", repr(status))
        self.assertIn("Leaky", status["detail"])


class DiarizationUnavailableTest(unittest.TestCase):
    def test_a_missing_model_fails_the_job_clearly_instead_of_silently_dropping_speakers(self):
        def loader():
            raise app.diarization.DiarizationUnavailable("GatedRepoError", retryable=False)

        job, _, model = run_diarized_job(loader=loader)
        self.assertEqual(job["state"], "failed")
        self.assertIs(job["retryable"], False)
        self.assertIn("Speaker identification is unavailable", job["detail"])
        model.transcribe.assert_not_called()


class ProgressMappingTest(unittest.TestCase):
    def test_pyannote_steps_map_onto_one_rising_bar(self):
        from diarization import hook_progress

        values = [
            hook_progress("segmentation", 10, 5),
            hook_progress("segmentation", 10, 10),
            hook_progress("embeddings", 4, 2),
            hook_progress("embeddings", 4, 4),
        ]
        self.assertEqual(values, sorted(values))
        self.assertGreater(values[-1], 0.9)
        self.assertLess(values[-1], 1.0)
        self.assertIsNone(hook_progress("something_new", 1, 1))
        self.assertEqual(hook_progress("segmentation", None, None), 0.0)


if __name__ == "__main__":
    unittest.main()
