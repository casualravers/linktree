# Casual Ravers — Linktree

Site statique (HTML/CSS/JS vanilla, sans build) pour le collectif tekno **Casual Ravers**.

## Structure

```
index.html   page unique
style.css    styles (thème sombre/brut)
assets/      logo et visuels (à ajouter)
```

## À faire avant mise en ligne

- **Titres SoundCloud** : dans la section `<section class="tracks">` de [index.html](index.html), chaque `<div class="track-block">` contient un titre, un lien Instagram et un player embarqué. Pour ajouter/retirer un titre, dupliquer/éditer/supprimer un bloc. L'URL du player s'obtient en remplaçant l'URL encodée après `?url=` dans le `src` de l'iframe par celle du nouveau titre (encoder les `/` en `%2F` ou `%3A` pour `:`, comme dans les blocs existants).
- **Dates à venir** : dans la section `<ul class="event-list">` de [index.html](index.html), dupliquer/éditer/supprimer les `<li class="event-item">` (date, lieu, lien billet). Utiliser `class="event-ticket soon"` et `href="#"` tant que la billetterie n'est pas ouverte.
- **Logo** : déposer le fichier dans `assets/` (ex: `assets/logo.png`), puis dans `index.html` remplacer le bloc `<h1 class="logo-text">...</h1>` par `<img src="assets/logo.png" alt="Casual Ravers" class="logo-img">` (commentaire déjà en place dans le fichier).

## Déploiement GitHub Pages

1. Pousser ce repo sur GitHub sous le nom `linktree` (organisation/compte `casualravers`).
2. Dans **Settings → Pages**, choisir la branche `main` et le dossier `/ (root)`.
3. Le site sera disponible sur `https://casualravers.github.io/linktree/`.

## Aperçu local

Ouvrir simplement `index.html` dans un navigateur, ou lancer un petit serveur local :

```bash
python -m http.server 8000
```

puis aller sur `http://localhost:8000`.
