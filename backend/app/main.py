from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.archive import router as archive_router
from app.api.v1.auth import router as auth_router
from app.api.v1.editor import router as editor_router
from app.api.v1.events import router as events_router
from app.api.v1.predictions import router as predictions_router
from app.api.v1.public import router as public_router
from app.core.config import settings

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "Αποτελέσματα, βαθμολογίες και γήπεδα ερασιτεχνικού ποδοσφαίρου, "
        "ανά Ένωση Ποδοσφαιρικών Σωματείων."
    ),
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(editor_router)
app.include_router(events_router)
app.include_router(predictions_router)
app.include_router(public_router)
# After the public router: its /{association_slug}/{...} routes are more
# specific, and a catch-all here would shadow them.
app.include_router(archive_router)


@app.get("/health", tags=["ops"])
async def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}
