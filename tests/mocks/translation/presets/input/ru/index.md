# Обзор

Публичный абзац.

{% if audience == "internal" %}

Внутренний абзац.

{% endif %}

{% if audience == "public" %}

Абзац только для внешних читателей.

{% endif %}

{% if support %}

Поддержка отвечает по будням.

{% endif %}
