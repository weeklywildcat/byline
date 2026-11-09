# Newsroom jobs

Payload jobs run outside web requests. The production Compose project runs dedicated workers for media preparation, publication snapshots and deploy hooks, scheduled publication, and maintenance. Reporting has an optional worker for transcription.

Use the [newsroom deployment guide](newsroom-deployment.md) for the worker process model, [snapshot operations](payload-build-snapshots.md) for publication and recovery, and [publication media](publication-media.md) when an asset blocks a snapshot.
