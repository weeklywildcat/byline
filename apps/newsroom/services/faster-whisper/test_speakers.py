"""Speaker attribution fixtures: no pyannote, torch or Hugging Face needed."""
import sys
import unittest

import speakers
from speakers import normalize_turns, segments_for, speaker_for_span

TURNS = normalize_turns([
    {"start": 0.4, "end": 4.8, "speaker": "SPEAKER_00"},
    {"start": 4.8, "end": 9.2, "speaker": "SPEAKER_01"},
])


def words(*items):
    return [{"start": start, "end": end, "word": word} for start, end, word in items]


class NormalizeTurnsTest(unittest.TestCase):
    def test_labels_follow_first_appearance_not_model_numbering(self):
        turns = normalize_turns([
            {"start": 5.0, "end": 8.0, "speaker": "SPEAKER_07"},
            {"start": 0.0, "end": 4.0, "speaker": "SPEAKER_02"},
            {"start": 8.0, "end": 9.0, "speaker": "SPEAKER_02"},
        ])
        self.assertEqual([t["speaker"] for t in turns], ["SPEAKER_00", "SPEAKER_01", "SPEAKER_00"])
        self.assertEqual(turns[0]["start"], 0.0)

    def test_drops_malformed_and_empty_turns(self):
        turns = normalize_turns([
            {"start": 1.0, "end": 1.0, "speaker": "A"},
            {"start": -1.0, "end": 2.0, "speaker": "A"},
            {"start": "x", "end": 2.0, "speaker": "A"},
            {"start": 1.0, "end": 2.0},
            {"start": 1.0, "end": 2.0, "speaker": "A"},
        ])
        self.assertEqual(turns, [{"start": 1.0, "end": 2.0, "speaker": "SPEAKER_00"}])

    def test_labels_are_scoped_to_one_recording(self):
        # Two different recordings that each start with a different person
        # both produce SPEAKER_00: the label is never a cross-recording identity.
        a = normalize_turns([{"start": 0, "end": 2, "speaker": "cluster-9"}])
        b = normalize_turns([{"start": 0, "end": 2, "speaker": "cluster-3"}])
        self.assertEqual(a[0]["speaker"], b[0]["speaker"])
        self.assertEqual(a[0]["speaker"], "SPEAKER_00")


class SpeakerForSpanTest(unittest.TestCase):
    def test_largest_overlap_wins(self):
        self.assertEqual(speaker_for_span(TURNS, 4.0, 5.0), "SPEAKER_00")
        self.assertEqual(speaker_for_span(TURNS, 4.7, 6.0), "SPEAKER_01")

    def test_tie_is_decided_by_the_midpoint(self):
        # Overlapping speech: both turns cover the word equally, so the
        # speaker at its midpoint (the earlier turn here) is chosen, every time.
        overlapping = normalize_turns([
            {"start": 0.0, "end": 6.0, "speaker": "A"},
            {"start": 4.0, "end": 10.0, "speaker": "B"},
        ])
        self.assertEqual(speaker_for_span(overlapping, 4.5, 5.5), "SPEAKER_00")

    def test_a_short_gap_joins_the_nearest_turn_but_a_long_one_is_unknown(self):
        self.assertEqual(speaker_for_span(TURNS, 9.4, 9.6), "SPEAKER_01")
        self.assertIsNone(speaker_for_span(TURNS, 30.0, 30.5))
        self.assertIsNone(speaker_for_span([], 1.0, 2.0))


class SegmentsForTest(unittest.TestCase):
    def test_two_whisper_segments_in_two_turns_make_two_speakers(self):
        first = segments_for(
            start=0.5, end=4.0, text="What did you think?", turns=TURNS,
            words=words((0.5, 1.0, " What"), (1.0, 1.4, " did"), (1.4, 1.8, " you"), (1.8, 4.0, " think?")),
        )
        second = segments_for(
            start=5.0, end=8.0, text="I was surprised.", turns=TURNS,
            words=words((5.0, 5.4, " I"), (5.4, 5.8, " was"), (5.8, 8.0, " surprised.")),
        )
        self.assertEqual([s["speaker"] for s in first + second], ["SPEAKER_00", "SPEAKER_01"])
        self.assertEqual(first[0]["text"], "What did you think?")

    def test_a_whisper_segment_across_a_speaker_boundary_is_split(self):
        turns = normalize_turns([
            {"start": 10.0, "end": 12.85, "speaker": "SPEAKER_00"},
            {"start": 12.85, "end": 16.0, "speaker": "SPEAKER_01"},
        ])
        result = segments_for(
            start=10.0, end=16.0, text="Did you expect that? Honestly no, not at all.", turns=turns,
            words=words(
                (10.0, 10.4, " Did"), (10.4, 10.7, " you"), (10.7, 11.5, " expect"), (11.5, 12.8, " that?"),
                (12.9, 13.6, " Honestly"), (13.6, 14.0, " no,"), (14.0, 14.5, " not"), (14.5, 15.0, " at"), (15.0, 16.0, " all."),
            ),
        )
        self.assertEqual(result, [
            {"start": 10.0, "end": 12.8, "text": "Did you expect that?", "speaker": "SPEAKER_00"},
            {"start": 12.9, "end": 16.0, "text": "Honestly no, not at all.", "speaker": "SPEAKER_01"},
        ])

    def test_consecutive_words_for_one_speaker_stay_one_segment(self):
        result = segments_for(
            start=0.5, end=4.5, text="one two three four", turns=TURNS,
            words=words((0.5, 1.0, " one"), (1.0, 2.0, " two"), (2.0, 3.0, " three"), (3.0, 4.5, " four")),
        )
        self.assertEqual(len(result), 1)
        self.assertEqual((result[0]["start"], result[0]["end"]), (0.5, 4.5))

    def test_speaker_changes_back_and_forth_each_start_a_new_segment(self):
        result = segments_for(
            start=4.0, end=6.0, text="a b c", turns=TURNS,
            words=words((4.1, 4.5, " a"), (5.0, 5.4, " b"), (5.5, 5.9, " c")),
        )
        self.assertEqual([s["speaker"] for s in result], ["SPEAKER_00", "SPEAKER_01"])

    def test_unmatched_timing_falls_back_without_naming_anyone(self):
        far = segments_for(
            start=60.0, end=62.0, text="Nobody was diarized here.", turns=TURNS,
            words=words((60.0, 61.0, " Nobody"), (61.0, 62.0, " here.")),
        )
        self.assertEqual(far, [{"start": 60.0, "end": 62.0, "text": "Nobody here."}])
        self.assertNotIn("speaker", far[0])

    def test_no_word_timing_uses_the_whisper_segment_span(self):
        result = segments_for(start=1.0, end=4.0, text="Whole segment", words=None, turns=TURNS)
        self.assertEqual(result, [{"start": 1.0, "end": 4.0, "text": "Whole segment", "speaker": "SPEAKER_00"}])
        garbage = segments_for(start=1.0, end=4.0, text="Whole segment", words=[{"word": " x"}, {"start": 5, "end": 2, "word": " y"}], turns=TURNS)
        self.assertEqual(garbage[0]["text"], "Whole segment")

    def test_no_turns_at_all_leaves_every_word_unattributed(self):
        result = segments_for(start=0.0, end=2.0, text="hi there", turns=[], words=words((0.0, 1.0, " hi"), (1.0, 2.0, " there")))
        self.assertEqual(result, [{"start": 0.0, "end": 2.0, "text": "hi there"}])

    def test_same_words_give_the_same_speakers_every_time(self):
        args = dict(
            start=4.0, end=6.0, text="a b c", turns=TURNS,
            words=words((4.1, 4.5, " a"), (5.0, 5.4, " b"), (5.5, 5.9, " c")),
        )
        self.assertEqual(segments_for(**args), segments_for(**args))


class IsolationTest(unittest.TestCase):
    def test_attribution_never_imports_the_neural_stack(self):
        self.assertNotIn("pyannote", sys.modules)
        self.assertNotIn("torch", sys.modules)
        self.assertIsNotNone(speakers)


if __name__ == "__main__":
    unittest.main()
