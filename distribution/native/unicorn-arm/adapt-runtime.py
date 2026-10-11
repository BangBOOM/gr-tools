from pathlib import Path
import re
import sys
source, output = map(Path, sys.argv[1:])
text = source.read_text()
pattern = r'var ENVIRONMENT_IS_NODE=[^;]+;'
text, count = re.subn(pattern, 'var ENVIRONMENT_IS_NODE=false;', text, count=1)
if count != 1:
    raise RuntimeError('Expected one Node environment declaration')
output.write_text("/* GR Tools modifications, 2026-10-09: disable Node filesystem detection; add ESM default export. */\n" + text + '\nexport default MUnicorn;\n')
