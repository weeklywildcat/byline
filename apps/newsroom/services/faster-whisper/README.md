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

### CPU performance

The service exposes faster-whisper/CTranslate2's main CPU tuning controls:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WHISPER_DEVICE` | `auto` | Set `cpu` on a CPU-only server. |
| `WHISPER_COMPUTE_TYPE` | `default` | Use `int8` for faster, lower-memory CPU inference. |
| `WHISPER_CPU_THREADS` | library default | Intra-op CPU threads. Prefer the number of physical cores, not SMT/logical threads. |
| `WHISPER_BATCH_SIZE` | `1` | `>1` enables faster-whisper's `BatchedInferencePipeline`; higher values trade RAM for throughput. |
| `WHISPER_WORD_TIMESTAMPS` | `0` | Individual word alignment. Byline only needs segment timestamps, so leave this off. |
| `WHISPER_MAX_WORKERS` | `1` | Number of whole recordings that may transcribe concurrently. |

For a 4-core / 8-thread CPU newsroom server with 16 GB RAM, a sensible starting
point for the `small` model is:

```sh
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
WHISPER_CPU_THREADS=4
WHISPER_BATCH_SIZE=4
WHISPER_MAX_WORKERS=1
WHISPER_WORD_TIMESTAMPS=0
```

Benchmark before raising `WHISPER_BATCH_SIZE`: batched inference can be much
faster, but memory usage increases with the batch size and model.

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
