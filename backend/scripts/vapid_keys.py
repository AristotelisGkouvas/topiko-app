"""Generate the VAPID keypair notifications are signed with.

    python -m scripts.vapid_keys

Run once per deployment. The pair identifies this server to every push
service; changing it silently invalidates every existing subscription, so it
belongs in the environment and not in a file anyone edits casually.
"""

from __future__ import annotations

import base64

from py_vapid import Vapid01

from app.core.console import use_utf8_stdout


def main() -> int:
    use_utf8_stdout()

    vapid = Vapid01()
    vapid.generate_keys()

    # The browser wants the public key as raw, uncompressed EC point in
    # base64url without padding. Anything else is accepted by the
    # subscription call and then fails to decrypt, which is a hard thing to
    # debug from the phone.
    from cryptography.hazmat.primitives import serialization

    public = vapid.public_key.public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    private = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")

    b64 = lambda raw: base64.urlsafe_b64encode(raw).rstrip(b"=").decode()  # noqa: E731

    print("Πρόσθεσέ τα στο .env:\n")
    print(f"VAPID_PUBLIC_KEY={b64(public)}")
    print(f"VAPID_PRIVATE_KEY={b64(private)}")
    print("VAPID_SUBJECT=mailto:CHANGE-ME@example.com")
    print(
        "\nΤο VAPID_SUBJECT είναι υποχρεωτικό — οι push services απορρίπτουν"
        "\nμήνυμα χωρίς αυτό, και η απόρριψη μοιάζει με πρόβλημα κλειδιού."
        "\nΗ αλλαγή του ζεύγους ακυρώνει κάθε υπάρχουσα εγγραφή."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
