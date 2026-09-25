"""Uploaded images: club logos, gallery photos, sponsor logos.

Nothing is stored as sent. Every upload is decoded with Pillow — which is also
the check that it is an image at all, whatever its name or content type says —
turned upright from its EXIF orientation, shrunk, and written back out as a
WebP. That drops the EXIF block with it, and with it the GPS position a phone
writes into every photo of a pitch.

Every file gets a fresh random name, so a URL never changes meaning: it can be
cached forever, and replacing a logo is a new URL rather than a stale one in
somebody's browser. Random rather than a content hash, because the same image
uploaded for two sponsors would otherwise be one file, and deleting either
sponsor would take the other's logo with it.
"""

from __future__ import annotations

import io
import secrets
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import settings

#: Refuse decompression bombs well before Pillow's own warning threshold: a
#: 40-megapixel image is already larger than any phone camera produces.
Image.MAX_IMAGE_PIXELS = 40_000_000

_ACCEPTED = {"JPEG", "PNG", "WEBP", "GIF", "MPO"}


class Kind(Enum):
    """What an image is for, which decides how large it is kept."""

    #: A crest or a sponsor's mark: small, transparency kept.
    LOGO = "logo"
    #: A gallery photo: large enough for a laptop screen, no larger.
    PHOTO = "photo"


#: Longest edge, in pixels.
_EDGE = {Kind.LOGO: 512, Kind.PHOTO: 1600}
_THUMB_EDGE = 480


@dataclass
class Stored:
    url: str
    width: int
    height: int
    #: Only for photos: the small copy the gallery grid shows.
    thumb_url: str | None = None


def _root() -> Path:
    return Path(settings.media_dir)


def _write(image: Image.Image, folder: str, *, lossless: bool) -> str:
    buffer = io.BytesIO()
    image.save(buffer, "WEBP", quality=82, lossless=lossless, method=6)
    data = buffer.getvalue()
    name = f"{secrets.token_hex(10)}.webp"
    target = _root() / folder
    target.mkdir(parents=True, exist_ok=True)
    (target / name).write_bytes(data)
    return f"{settings.media_url}/{folder}/{name}"


def _bad(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


async def store(upload: UploadFile, folder: str, kind: Kind) -> Stored:
    """Decode, normalise and write one upload. Raises 422 on anything that is
    not an image this site should serve."""
    data = await upload.read(settings.media_max_bytes + 1)
    if len(data) > settings.media_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Η εικόνα είναι πολύ μεγάλη (έως 12 MB).",
        )
    if not data:
        raise _bad("Το αρχείο είναι κενό.")

    try:
        opened = Image.open(io.BytesIO(data))
        if opened.format not in _ACCEPTED:
            raise _bad("Δεκτές μόνο εικόνες JPEG, PNG, WebP ή GIF.")
        # An animated GIF keeps its first frame.
        opened.seek(0)
        opened.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, EOFError) as error:
        raise _bad("Το αρχείο δεν είναι εικόνα που μπορεί να διαβαστεί.") from error

    # A phone stores a portrait photo sideways plus a flag saying so; the
    # flag goes with the EXIF, so the pixels have to be turned first.
    image: Image.Image = ImageOps.exif_transpose(opened) or opened

    keep_alpha = kind is Kind.LOGO and (
        image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info
    )
    image = image.convert("RGBA" if keep_alpha else "RGB")

    full = image.copy()
    full.thumbnail((_EDGE[kind], _EDGE[kind]), Image.Resampling.LANCZOS)
    # Logos are flat colour and small: lossless keeps their edges clean at a
    # size lossy would barely beat. Photos are the opposite.
    url = _write(full, folder, lossless=kind is Kind.LOGO)

    thumb_url = None
    if kind is Kind.PHOTO:
        thumb = image.copy()
        thumb.thumbnail((_THUMB_EDGE, _THUMB_EDGE), Image.Resampling.LANCZOS)
        thumb_url = _write(thumb, folder, lossless=False)

    return Stored(url=url, width=full.width, height=full.height, thumb_url=thumb_url)


def discard(*urls: str | None) -> None:
    """Delete files this module wrote. Anything else — an external URL typed in
    before uploads existed, a path outside the media root — is left alone."""
    root = _root().resolve()
    prefix = f"{settings.media_url}/"
    for url in urls:
        if not url or not url.startswith(prefix):
            continue
        path = (root / url[len(prefix) :]).resolve()
        if root in path.parents and path.is_file():
            path.unlink()
