from __future__ import annotations

import hashlib
import hmac
import secrets

import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()

MIN_PASSWORD_LENGTH = 10
RECOVERY_CODE_COUNT = 10
TOTP_ISSUER = "F-Droid Panel"
# Readable codes without characters that look alike (0/O, 1/I/L).
_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


# Burns the same time as a real verification when the user does not exist.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def waste_password_check(password: str) -> None:
    verify_password(_DUMMY_HASH, password)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Tokens are random and long, so a plain SHA-256 is enough to avoid storing them as is."""
    return hashlib.sha256(token.encode()).hexdigest()


def tokens_equal(first: str, second: str) -> bool:
    return hmac.compare_digest(first.encode(), second.encode())


def new_code(groups: int = 3, size: int = 4) -> str:
    """A human friendly one-time code such as K7QM-2XRP-V9TD."""
    return "-".join("".join(secrets.choice(_CODE_ALPHABET) for _ in range(size)) for _ in range(groups))


def normalize_code(code: str) -> str:
    cleaned = "".join(char for char in code.upper() if char.isalnum())
    return "-".join(cleaned[i : i + 4] for i in range(0, len(cleaned), 4))


def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, username: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=TOTP_ISSUER)


def verify_totp(secret: str, code: str) -> bool:
    digits = "".join(char for char in code if char.isdigit())
    return len(digits) == 6 and pyotp.TOTP(secret).verify(digits, valid_window=1)
