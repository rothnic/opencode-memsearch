import sys
sys.path.insert(0, '/usr/local/lib/python3.14/site-packages')

from memsearch.core import MemSearch
from memsearch.config import load_config
import time

# Load a small file first
file_path = "/Users/nroth/workspace/opencode-memsearch/.memsearch/sessions/ses_39d79394bffeZRgN4ljyTEsjdE.md"

print(f"Loading: {file_path}")
with open(file_path, 'r') as f:
    content = f.read()
print(f"Content size: {len(content)} bytes, {len(content.split(chr(10)))} lines")

# Load config
cfg = load_config()
print(f"\nConfig: max_chunk_size={cfg.chunking.max_chunk_size}, overlap={cfg.chunking.overlap_lines}")

# Create MemSearch instance
print("\nCreating MemSearch...")
ms = MemSearch([file_path], 
    milvus_uri=cfg.milvus.uri,
    milvus_token=cfg.milvus.token,
    embedding_provider=cfg.embedding.provider,
    embedding_model=cfg.embedding.model,
    embedding_host=cfg.embedding.host if hasattr(cfg.embedding, 'host') else None,
    collection=cfg.milvus.collection,
    max_chunk_size=cfg.chunking.max_chunk_size,
    overlap_lines=cfg.chunking.overlap_lines
)

print("MemSearch created successfully")
print(f"Collection: {cfg.milvus.collection}")
