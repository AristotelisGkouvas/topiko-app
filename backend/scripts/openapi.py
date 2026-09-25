"""Print the API's OpenAPI document.

The frontend's types are generated from it (`npm run types` in frontend/), so
the two cannot drift: CI regenerates them and fails if the committed copy
differs. Built in-process, so it works whatever /openapi.json is set to serve.
"""

import json
import sys

from app.core.console import use_utf8_stdout
from app.main import app

if __name__ == "__main__":
    use_utf8_stdout()
    json.dump(app.openapi(), sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
    sys.stdout.write("\n")
