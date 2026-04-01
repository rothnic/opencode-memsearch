import sys
sys.path.insert(0, '/usr/local/lib/python3.14/site-packages')

from memsearch.chunking import chunk_file
from pathlib import Path

# Test with a medium file
file_path = "/Users/nroth/workspace/opencode-memsearch/.memsearch/sessions/ses_365b95080ffeKGFkQC650LG1px.md"

print(f"Testing chunking for: {file_path}")
print(f"File size: {Path(file_path).stat().st_size} bytes")
print()

# Read file
with open(file_path, 'r') as f:
    content = f.read()

lines = content.split('\n')
print(f"Total lines: {len(lines)}")
print()

# Check what chunk_file does
try:
    # Check if we can see the chunking logic
    import inspect
    source = inspect.getsource(chunk_file)
    print("chunk_file source:")
    print(source[:1000])
    print("...")
except Exception as e:
    print(f"Could not get source: {e}")

# Try to chunk manually
print("\n\nManual chunking test:")
chunks = []
current_chunk = []
current_size = 0
max_lines = 1500  # From config

for i, line in enumerate(lines):
    current_chunk.append(line)
    current_size += len(line)
    
    # Check if we should create a new chunk
    if len(current_chunk) >= max_lines:
        chunks.append('\n'.join(current_chunk))
        print(f"  Chunk {len(chunks)}: {len(current_chunk)} lines, {current_size} bytes")
        current_chunk = []
        current_size = 0
        
        if len(chunks) >= 3:
            print("  ... (stopping after 3 chunks)")
            break

if current_chunk:
    chunks.append('\n'.join(current_chunk))
    print(f"  Chunk {len(chunks)}: {len(current_chunk)} lines (final)")

print(f"\nTotal chunks: {len(chunks)}")
