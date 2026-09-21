"""Create or update an editor/admin account.

    python -m scripts.create_user --email a@b.gr --role admin
    python -m scripts.create_user --email c@d.gr --association epsip-ipeirou --live

There is no public sign-up: write access to live results is handed to a small
number of known people, so accounts are made here rather than through a route
that would have to be defended against everyone else.

The password is read from a prompt, never from an argument — a shell history
and a process list are both readable by anyone on the machine.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import secrets
import sys

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.console import use_utf8_stdout
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Association, User, UserAssociation
from app.models.enums import UserRole


def read_password(generate: bool) -> tuple[str, bool]:
    """The password to set, and whether it has to be shown to the operator."""
    if generate:
        return secrets.token_urlsafe(18), True

    first = getpass.getpass("Κωδικός: ")
    if len(first) < 12:
        print("Ο κωδικός θέλει τουλάχιστον 12 χαρακτήρες.", file=sys.stderr)
        raise SystemExit(2)
    if first != getpass.getpass("Επανάληψη: "):
        print("Οι κωδικοί δεν ταιριάζουν.", file=sys.stderr)
        raise SystemExit(2)
    return first, False


async def upsert(args: argparse.Namespace, password: str) -> int:
    email = args.email.strip().lower()

    async with SessionLocal() as db:
        user = (
            await db.execute(
                select(User)
                .where(User.email == email)
                .options(selectinload(User.associations))
            )
        ).scalar_one_or_none()

        created = user is None
        if user is None:
            user = User(email=email)
            db.add(user)

        user.password_hash = hash_password(password)
        user.role = UserRole(args.role)
        user.is_active = True
        if args.name:
            user.full_name = args.name

        # Needed before a grant can reference it on a first run.
        await db.flush()

        if args.association:
            association = (
                await db.execute(
                    select(Association).where(Association.slug == args.association)
                )
            ).scalar_one_or_none()
            if association is None:
                print(
                    f"Δεν βρέθηκε ένωση '{args.association}'.",
                    file=sys.stderr,
                )
                return 1

            # Queried rather than read off user.associations: on a first run
            # the User was built in memory, so touching the relationship lazy
            # loads it and asyncpg raises MissingGreenlet.
            grant = (
                await db.execute(
                    select(UserAssociation).where(
                        UserAssociation.user_id == user.id,
                        UserAssociation.association_id == association.id,
                    )
                )
            ).scalar_one_or_none()
            if grant is None:
                grant = UserAssociation(
                    user_id=user.id, association_id=association.id
                )
                db.add(grant)
            grant.can_edit_live = args.live
        elif user.role is UserRole.EDITOR:
            # An editor with no grant can log in and see nothing, which reads
            # as a broken dashboard rather than as a missing permission.
            print(
                "ΠΡΟΣΟΧΗ: editor χωρίς --association δεν βλέπει καμία ένωση.",
                file=sys.stderr,
            )

        await db.commit()

    print(f"{'Δημιουργήθηκε' if created else 'Ενημερώθηκε'}: {email} ({args.role})")
    if args.association:
        scope = "με" if args.live else "χωρίς"
        print(f"  ένωση {args.association} — {scope} δικαίωμα live διόρθωσης")
    return 0


def main() -> int:
    use_utf8_stdout()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", help="Ονοματεπώνυμο.")
    parser.add_argument(
        "--role", choices=[r.value for r in UserRole], default=UserRole.EDITOR.value
    )
    parser.add_argument(
        "--association",
        help="Slug ένωσης στην οποία δίνεται πρόσβαση. Οι admin δεν το χρειάζονται.",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Επιτρέπει διόρθωση σκορ όσο ο αγώνας παίζεται.",
    )
    parser.add_argument(
        "--generate-password",
        action="store_true",
        help="Φτιάξε τυχαίο κωδικό και τύπωσέ τον μία φορά.",
    )
    args = parser.parse_args()

    password, show = read_password(args.generate_password)
    code = asyncio.run(upsert(args, password))
    if code == 0 and show:
        print(f"  κωδικός: {password}")
        print("  (δεν ξαναεμφανίζεται — αποθήκευσέ τον τώρα)")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
