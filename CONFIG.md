Milvus configuration for memsearch
================================

This document explains how to run Milvus for use with the memsearch CLI used by the opencode-memsearch plugin. It covers running Milvus locally with Docker Compose (the repository contains a milvus-compose.yaml), configuring your ~/.memsearch.toml, important environment variables, common troubleshooting steps, and notes about milvus_uri and milvus_token.

1) Supported Milvus versions
---------------------------

- Upstream memsearch supports Milvus 2.6.2+. This plugin was validated with Milvus 2.6.x and compatible Milvus images.

2) Run Milvus locally with Docker Compose
----------------------------------------

The repository includes milvus-compose.yaml at the project root. To start Milvus (standalone) plus required dependencies (etcd, MinIO):

1. Ensure Docker and Docker Compose are installed on your machine.
2. From the repository root run:

   docker compose -f milvus-compose.yaml up -d

This starts three containers:
- etcd (milvus-etcd) — metadata store
- minio (milvus-minio) — S3-compatible object store used by Milvus for large files
- milvus (milvus-standalone) — the Milvus server

To stop and remove containers:

   docker compose -f milvus-compose.yaml down

Volumes are declared under ./volumes in the compose file so data persists between runs.

3) About the included milvus-compose.yaml
----------------------------------------

- The compose file in this project exposes Milvus gRPC port 19530 and HTTP port 9091. It also sets up MinIO with default credentials (minioadmin/minioadmin) and an embedded etcd instance.
- If you need a different Milvus image (eg. 2.6.2+), update the image tag in milvus-compose.yaml (milvusdb/milvus:<tag>). The compose file here uses milvus v2.3.0 as an example — for production or compatibility with memsearch, use 2.6.2+.

4) Configure ~/.memsearch.toml
-----------------------------

memsearch expects a TOML config at ~/.memsearch.toml. Key settings for Milvus are shown below with explanations.

Example ~/.memsearch.toml

```toml
[default]
backend = "milvus"
# address for Milvus gRPC service (host:port)
milvus_addr = "127.0.0.1:19530"
# Optional bearer token for Milvus (if Milvus is secured with token auth)
milvus_token = ""
# Optional collection prefix to namespace collections
collection_prefix = "opencode"
# embedding model name for memsearch
embedding_model = "openai-embedding-model"
# enable BM25 component for hybrid search
bm25 = true
```

Important keys
- backend: must be "milvus" to use Milvus for vector storage
- milvus_addr: host:port to reach Milvus gRPC endpoint (19530 is the default). Use 127.0.0.1:19530 for local Docker Compose.
- milvus_token: optional string used when Milvus is started with token-based auth. Leave empty for unsecured local setups.
- collection_prefix: helpful to namespace indexes created by memsearch (eg. opencode_sessions)

5) milvus_uri vs milvus_addr vs milvus_token
-------------------------------------------

- milvus_addr is the low-level host:port used by memsearch to connect to the Milvus gRPC endpoint (example: 127.0.0.1:19530).
- milvus_uri is sometimes used by higher-level tools or examples as a URI form (eg. milvus://127.0.0.1:19530). memsearch uses milvus_addr in the TOML; if you see milvus_uri in docs or examples treat it as a URI wrapper. If a tool accepts milvus_uri, either provide milvus://host:port or host:port depending on that tool's expectation.
- milvus_token is the authentication token string used when Milvus has TOKEN authentication enabled. When running Milvus locally with no auth, leave milvus_token blank. When using token auth, set milvus_token to the token generated/required by your Milvus deployment and ensure memsearch's config includes it.

6) Remote Milvus (cloud or managed)
----------------------------------

If you use a remote Milvus instance, set milvus_addr to the host:port of the remote gRPC endpoint. If the remote instance requires TLS or token-based auth, consult your provider for the correct connection string and token. memsearch currently expects an address and optional token in ~/.memsearch.toml; if additional TLS config is required you may need to place certificates in the host environment or use a VPN/SSH tunnel.

7) Connection troubleshooting
-----------------------------

- Error: connection refused / cannot connect to 127.0.0.1:19530
  - Ensure milvus container is running: docker compose -f milvus-compose.yaml ps
  - Check ports: docker compose -f milvus-compose.yaml logs milvus and look for successful startup messages and listening ports
  - If using Linux/WSL/Docker Desktop with networking differences, try replacing 127.0.0.1 with host.docker.internal or the Docker host IP

- Error: health check failing on HTTP /healthz
  - Check milvus container logs: docker compose -f milvus-compose.yaml logs milvus
  - Wait for dependencies (etcd, minio) to be healthy; the compose file includes depends_on but services may still need a moment to initialize

- Error: authentication failed / token required
  - If Milvus is configured with TOKEN auth, set milvus_token in ~/.memsearch.toml to the token value
  - Verify the token is correct and that your Milvus server expects token-based authentication. For local testing, run Milvus without auth or create a token per your Milvus deployment docs

- Error: S3/MinIO problems (data upload failures)
  - Ensure MinIO is reachable from Milvus (compose uses service name minio). Check MINIO_ACCESS_KEY and MINIO_SECRET_KEY match what Milvus expects. The compose file sets minioadmin/minioadmin.

8) Example quick verification
----------------------------

1. Start compose: docker compose -f milvus-compose.yaml up -d
2. Wait ~10-30s for services to initialize
3. In your ~/.memsearch.toml set milvus_addr = "127.0.0.1:19530"
4. Run a simple memsearch command (ensure memsearch is installed):

   memsearch version

   memsearch health --backend milvus

5. Index a small file or run the plugin's index command to ensure memsearch can create collections and insert vectors.

9) Security and production notes
--------------------------------

- For production use prefer Milvus in distributed mode and follow Milvus docs for HA, persistent volumes, resource sizing, and secure configuration.
- Use token auth and TLS for production deployments. Store milvus_token in a secure secrets manager rather than plaintext in home directory if possible.

10) Appendix: common Milvus endpoints and ports
-----------------------------------------------

- gRPC (vector operations): 19530 (default)
- HTTP (health/status/metrics): 9091 (often used by health checks)
- MinIO console: 9001 (as configured in compose)

Problems, notes and decisions (append to session indexer notepad)
-------------------------------------------------------------

After creating this file I will append a short summary to .sisyphus/notepads/session-indexing/learnings.md describing the compose usage and that memsearch expects milvus_addr + optional milvus_token in ~/.memsearch.toml.
