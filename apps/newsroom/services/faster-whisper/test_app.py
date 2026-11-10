"""Exercise the status route with deterministic regular and batched generators."""
import asyncio
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


if __name__ == "__main__":
    unittest.main()
