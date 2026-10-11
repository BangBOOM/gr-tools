# Deferred: Chinese localization

English is the initial UI language for GR Studio, GR Firmware, and the home page. Chinese localization is a separate future task.

- Extract interface copy, accessibility labels, dialogs, progress, and errors into locale resources. Keep the shared Tabbar in one component.
- Review a terminology glossary first. Keep RAW, DNG, LUT, CUBE, sRGB, RGB, White Balance, and other established terms in English where translation adds no clarity.
- Translate interface copy only. Preserve user-entered names, style metadata, UUIDs, schema keys, serialized camera tokens, and firmware/model hashes. Historical files must continue to load without rewriting their identities.
- Add a locale preference and an English fallback when Chinese resources are ready.
- Verify long labels, small screens, keyboard access, tooltips, dialogs, exports, and failure states in both languages. Changing language must not reset projects or affect rendering/build results.

The current English UI is not a claim that the localization layer has been implemented.
