import sys
sys.path.insert(0, '/usr/local/lib/python3.14/site-packages')

from memsearch.core import chunk_markdown

# Test different file sizes
files = [
    "/Users/nroth/workspace/opencode-memsearch/.memsearch/sessions/ses_39d79394bffeZRgN4ljyTEsjdE.md",  # Small
    "/Users/nroth/workspace/opencode-memsearch/.memsearch/sessions/ses_365b95080ffeKGFkQC650LG1px.md",  # Large
]

for file_path in files:
    with open(file_path, 'r') as f:
        text = f.read()
    
    chunks = chunk_markdown(text, source=file_path, max_chunk_size=1500, overlap_lines=2)
    
    print(f"\n{file_path.split('/')[-1]}:")
    print(f"  Size: {len(text)} bytes")
    print(f"  Chunks: {len(chunks)}")
    
    if chunks:
        sizes = [len(c.content) for c in chunks]
        print(f"  Avg chunk size: {sum(sizes)/len(sizes):.0f} bytes")
        print(f"  Max chunk size: {max(sizes)} bytes")
        print(f"  Min chunk size: {min(sizes)} bytes")
        
        # Show first few chunk headings
        print(f"  First 3 chunks:")
        for i, chunk in enumerate(chunks[:3]):
            print(f"    {i+1}. Lines {chunk.start_line}-{chunk.end_line}: {chunk.heading[:50] if chunk.heading else '(no heading)'} ({len(chunk.content)} bytes)")
