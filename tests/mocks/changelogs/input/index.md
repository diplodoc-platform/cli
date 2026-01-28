# Changelog Test

This is a test page for changelogs feature.

{% changelog %}
title: First Release
date: 2024-01-01
image:
  src: image1.png
  alt: First release image
description: |
  This is the first release with important changes.
{% endchangelog %}

{% changelog %}
title: Second Release
date: 2024-01-15
image:
  src: https://example.com/external-image.png
  alt: External image
description: |
  This release uses an external image.
{% endchangelog %}

{% changelog %}
title: Third Release
date: 2024-01-30
description: |
  This release has no image.
{% endchangelog %}
