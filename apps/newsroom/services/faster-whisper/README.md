# Byline transcription service (optional)

Self-hosted [faster-whisper](https://github.com/SYSTRAN/faster-whisper) behind
Byline's private transcription job contract
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
BYLINE_TRANSCRIPTION_PRIVATE=1            # newsroom infrastructure: queue automatically
BYLINE_TRANSCRIPTION_TIMEOUT_MS=7200000   # optional; default 2 hours
npm run jobs:reporting --workspace @byline/newsroom
```

Choose the model for the hardware (`small` or `medium` on CPU, `large-v3`
on a GPU). Nothing assumes a GPU. Keep the service on a private network; set
`BYLINE_TRANSCRIPTION_TOKEN` on both sides to require a bearer token.

## Long recordings

The service does not hold a single HTTP response open while Whisper works.
Byline starts an idempotent job and polls its progress:

- `POST /jobs/{job_key}` starts or reattaches to one transcription run.
- `GET /jobs/{job_key}` returns queued/loading/transcribing/ready state and
  measurable progress.
- `DELETE /jobs/{job_key}` requests cancellation.
- `GET /health` stays responsive while transcription is running.

Completed jobs stay in memory for six hours by default so a newsroom-worker
retry can recover the result without doing the CPU work again. Set
`WHISPER_JOB_TTL_SECONDS` to change that window.

`WHISPER_MAX_WORKERS` defaults to **1**. That deliberately serializes
CPU-heavy recordings on a typical newsroom/home server instead of letting
multiple long interviews saturate the machine at once. A GPU installation can
raise it after measuring capacity.
