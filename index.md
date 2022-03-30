---
title: index
custom_head: >
    <link rel="stylesheet" href="common_assets/site/home.css">
exclude_from_search: true
---

{% assign tags = nil %}
{% for page in site.pages %}
    {% assign first_folder = page.url | slice: 0, 5 %}
    {% if first_folder != "/bin/" %}
        {% continue %}
    {% endif %}
    {% if page.tags %}
        {% assign page_tags = page.tags %}
        {% unless page_tags[0] %}
            {% assign page_tags = page_tags | split: " " %}
        {% endunless %}
        {% assign tags = tags | concat: page_tags %}
    {% endif %}
{% endfor %}
{% assign tags = tags | uniq | sort %}


<article>
{% for tag in tags %}
{% assign slugged_tag = tag | slugify %}
<div>
    <h2 class="tag-name tag-{{ slugged_tag }}" id="tag-{{ slugged_tag }}">{{ tag }}</h2>
    <ul>
        {% assign pages = site.pages | where_exp: "item", "item.tags contains tag" | sort: "title" %}
        {% for page in pages %}
        <li class="{{ page.url | relative_url | slugify }} page"><span><a href="{{ page.url | relative_url }}">{{ page.title }}</a> {{ page.subtitle }}</span></li>
        {% endfor %}
    </ul>
</div>
{% endfor %}
