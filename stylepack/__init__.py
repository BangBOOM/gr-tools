"""Portable color targets shared by web authoring and desktop inspection."""

from .package import PackageError, create_package, inspect_package
from .icon import default_icon, render_icon, validate_icon

__all__ = ["PackageError", "create_package", "inspect_package", "default_icon", "render_icon", "validate_icon"]
