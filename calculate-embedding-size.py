import sys
sys.path.insert(0, '/usr/local/lib/python3.14/site-packages')

from memsearch.core import chunk_markdown

file_path = "/Users/nroth/workspace/opencode-memsearch/.memsearch/sessions/ses_365b95080ffeKGFkQC650LG1px.md"

with open(file_path, 'r') as f:
    text = f.read()

chunks = chunk_markdown(text, source=file_path, max_chunk_size=1500, overlap_lines=2)

# Calculate what gets sent to Ollama
total_chars = sum(len(c.content) for c in chunks)
max_chunk = max(len(c.content) for c in chunks)
avg_chunk = total_chars / len(chunks)

print(f"Embedding request would contain:")
print(f"  Chunks: {len(chunks)}")
print(f"  Total characters: {total_chars:,}")
print(f"  Average chunk: {avg_chunk:.0f} chars")
print(f"  Largest chunk: {max_chunk:,} chars")
print(f"  Estimated tokens: ~{total_chars // 4:,} tokens")
print()
print(f"This is sent in ONE API call to Ollama!")
print(f"No wonder it times out...")
