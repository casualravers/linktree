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

## Dépôt de doodles (Supabase Storage)

La section « Deposer ton doodle » envoie un mot (PNG), un dessin (PNG) ou une photo (JPEG) dans un bucket Supabase. `casual-overlay` lit ensuite ce bucket. Tant que Supabase n'est pas configuré, la section reste cachée.

1. Créer un projet sur [supabase.com](https://supabase.com) (gratuit).
2. **Storage → New bucket** : nom `doodles`, cocher **Public**, limiter la taille à 5 MB et les types à `image/png, image/jpeg`.
3. **SQL Editor**, exécuter :

```sql
create policy "depot anonyme" on storage.objects
  for insert to anon
  with check (bucket_id = 'doodles');

create policy "lecture publique doodles" on storage.objects
  for select to anon
  using (bucket_id = 'doodles');
```

4. **Project Settings → API** : copier la *Project URL* et la clé *anon public* dans la constante `DEPOT` de [depot.js](depot.js).

**Attention :** la clé anon est publique par conception. N'importe quel visiteur peut donc déposer un fichier dans le bucket, et les dépôts s'affichent sans modération. Les limites de taille et de type (étape 2) bornent les fichiers, mais pas le volume de dépôts.

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
