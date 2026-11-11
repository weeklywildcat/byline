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
| `WHISPER_WORD_TIMESTAMPS` | `0` | Individual word alignment. Needed only for speaker attribution, which turns it on itself when `WHISPER_DIARIZATION=1`; leave it off otherwise. |
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

## Speaker diarization

Interview transcripts need to show who is speaking. The service can run a local
[pyannote](https://github.com/pyannote/pyannote-audio) stage with
`pyannote/speaker-diarization-community-1` before faster-whisper, then match
Whisper's word timing to the speaker timeline. The recording is diarized once,
whole, so `SPEAKER_00` means the same voice throughout one transcript (it is
never the same person across recordings). Nothing is sent to a third party at
inference time and Byline never identifies a person from their voice.

| Variable | Default | Purpose |
| --- | --- | --- |
| `WHISPER_DIARIZATION` | `0` | `1` turns speaker diarization on. Off, the service needs no pyannote, torch or token and runs segment-only as before. |
| `WHISPER_DIARIZATION_MODEL` | `pyannote/speaker-diarization-community-1` | A Hugging Face model id, or a local pipeline directory/`config.yaml` for fully offline use. |
| `WHISPER_DIARIZATION_TOKEN` | empty | Hugging Face access token for the one-time model download. Server-side only: never returned by `/health` or a job, never logged, never sent to Byline or a browser. Do not commit it. |
| `WHISPER_DIARIZATION_DEVICE` | `cpu` (`cuda` with a CUDA `WHISPER_DEVICE`) | Where the speaker model runs. |
| `WHISPER_MIN_SPEAKERS`, `WHISPER_MAX_SPEAKERS` | automatic | Optional default speaker-count range (1-20). A job may also send `num_speakers`, `min_speakers` and `max_speakers` itself; an exact count wins. |

One-time setup:

1. On Hugging Face, accept the conditions for
   [`pyannote/speaker-diarization-community-1`](https://huggingface.co/pyannote/speaker-diarization-community-1)
   and create a read token.
2. On a CPU-only server install the CPU wheels first, then the requirements:

   ```sh
   pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
   pip install -r requirements.txt
   ```
3. Start the service with `WHISPER_DIARIZATION=1` and `WHISPER_DIARIZATION_TOKEN`
   set once. The model is cached with the Whisper model. Keep that cache on a
   persistent volume so recreating a container does not download it again:

   ```sh
   HF_HOME=/models/huggingface   # mount /models as a volume
   ```
4. After the first successful run the token is no longer needed: set
   `HF_HUB_OFFLINE=1` and remove `WHISPER_DIARIZATION_TOKEN` to run from the
   cache only.

Diarization and Whisper run **one after the other** for a recording, so on the
Weekly Wildcat 4-core CPU server they do not compete for the same cores. The job
reports *Loading speaker model → Identifying speakers (percent) → Loading Whisper
model → Transcribing audio (percent)*. A failure to load the speaker model fails
the job with a clear reason (and is retried only when retrying can help); it
never silently falls back to a transcript with no speakers.

### Tests

```sh
python -m unittest test_app test_speakers   # no model download, token or GPU
```

The reconciliation logic (`speakers.py`) and the job stages are tested with
fixtures; the real pyannote model is never loaded in CI.

### Manual smoke test

With the service running with diarization on and Byline pointed at it:

1. Record or take a ~1 minute clip of two people taking turns (an interviewer's
   question, an answer, a follow-up).
2. Upload it to a Story's reporting material.
3. Watch the transcript: *Loading speaker model*, *Identifying speakers* with a
   rising percent, then *Transcribing audio*. The first text should already be
   in turns: **Speaker 1** (question) / **Speaker 2** (answer) / **Speaker 1**.
4. When it is ready, open **Speakers**, press **Play sample** for each voice,
   and name them (for example *Reporter* and *Interviewee*). Every passage
   updates; timestamps and words do not change.
5. `curl http://127.0.0.1:9000/health` shows `"diarization": true` and no token.

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
