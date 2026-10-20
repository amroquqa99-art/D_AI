"""Public failures contain identifiers/reasons, never private record contents."""


class DaiError(Exception):
    """Base for failures safe to present at the local protocol boundary."""


class AccessDenied(DaiError):
    """The authenticated actor lacks a required scoped capability."""


class Conflict(DaiError):
    """A version, operation state or immutable identifier changed."""


class NotFound(DaiError):
    """An authorized lookup did not find the requested resource."""


class Gone(DaiError):
    """The managed encryption key was destroyed; normal recovery is impossible."""


class IntegrityFailure(DaiError):
    """Persisted or encrypted data failed validation."""


class InvalidRequest(DaiError):
    """An untrusted request failed boundary validation."""
