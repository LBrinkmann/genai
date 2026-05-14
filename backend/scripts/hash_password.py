#!/usr/bin/env python
"""Generate a bcrypt hash for the admin password.

Usage:
    poetry run python backend/scripts/hash_password.py

Reads a password from stdin (no echo) and prints the bcrypt hash on
stdout. Paste the printed hash into ADMIN_PASSWORD_HASH in your .env
(quoting it so the $ characters do not get interpreted by the shell).

The plaintext password should never live on disk or in environment
variables; only the hash does.
"""

import getpass
import sys

import bcrypt


def main() -> int:
    """Read a password and print its bcrypt hash."""
    try:
        password = getpass.getpass("Password: ")
        confirm = getpass.getpass("Confirm:  ")
    except (EOFError, KeyboardInterrupt):
        print("\nAborted.", file=sys.stderr)
        return 1

    if not password:
        print("Password must not be empty.", file=sys.stderr)
        return 1
    if password != confirm:
        print("Passwords do not match.", file=sys.stderr)
        return 1

    hashed = bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(rounds=12),
    )
    print(hashed.decode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
