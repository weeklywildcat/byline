# Byline transcription service (optional)

Self-hosted [faster-whisper](https://github.com/SYSTRAN/faster-whisper) behind
the small HTTP contract Byline's `faster-whisper` provider uses
(`apps/newsroom/src/reporting/transcription/faster-whisper.ts`). Byline works
without it: recordings still upload and transcripts can be imported (.txt,
.srt, .vtt).

```sh
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
WHISPER_MODEL=small uvicorn app:app --host 127.0.0.1 --port 9000
```

Then, in the newsroom's environment:

```sh
BYLINE_TRANSCRIPTION_PROVIDER=faster-whisper
BYLINE_TRANSCRIPTION_URL=http://127.0.0.1:9000
BYLINE_TRANSCRIPTION_MODEL=small          # optional: the service's default otherwise
BYLINE_TRANSCRIPTION_PRIVATE=1            # it runs on newsroom infrastructure: queue automatically
npm run jobs:reporting --workspace @byline/newsroom
```

Choose the model for the hardware (`small` or `medium` on CPU, `large-v3` on a
GPU). Nothing assumes a GPU. Keep the service on a private network; set
`BYLINE_TRANSCRIPTION_TOKEN` on both sides to require a bearer token.
