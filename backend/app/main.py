from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

app.include_router(public_router)


@app.get("/health", tags=["ops"])
async def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}
