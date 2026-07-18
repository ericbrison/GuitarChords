# Manche — positions d'accords

Application web pour guitaristes et bassistes : affiche **toutes les positions
jouables** d'un accord sur le manche (ex. CM7), avec diagrammes et écoute au
toucher. 100 % vanilla JS, **aucune dépendance**, aucun appel serveur,
installable sur smartphone (PWA), utilisable hors-ligne.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Application complète (moteur + interface inline, autonome) |
| `manifest.json` | Manifeste PWA (installation sur l'écran d'accueil) |
| `sw.js` | Service worker cache-first (hors-ligne) |
| `icon-*.png` | Icônes 192/512 + variante *maskable* Android |
| `engine.js` | Source séparée du moteur de voicings (référence/tests, déjà inlinée dans index.html) |

## Déploiement

### GitHub Pages (recommandé pour un compte personnel)

1. Créer le dépôt (ex. `manche`) et pousser les fichiers à la racine :

   ```bash
   git init && git add . && git commit -m "Manche v1"
   git branch -M main
   git remote add origin git@github.com:ericbrison/GuitarChords.git
   git push -u origin main
   ```

2. Sur GitHub : **Settings → Pages → Source : Deploy from a branch**,
   branche `main`, dossier `/ (root)`.

3. L'app est servie en HTTPS sur `https://ericbrison.github.io/GuitarChords/` —
   tous les chemins du projet sont relatifs, le sous-chemin ne pose aucun
   problème (manifeste, service worker et icônes compris).

Installation sur smartphone : ouvrir cette URL dans Chrome/Safari →
« Ajouter à l'écran d'accueil ». L'app fonctionne ensuite sans réseau.

**Mise à jour** : après chaque push modifiant les fichiers, incrémenter
`VERSION` dans `sw.js` (sinon le service worker servira l'ancienne version
depuis le cache). Pages redéploie automatiquement à chaque push sur `main`.

### Autre hébergement statique

N'importe quel serveur HTTPS convient :

```bash
rsync -av ./ user@serveur:/var/www/manche/
```

Test local : `php -S localhost:8000` ou `python3 -m http.server` — le SW
fonctionne aussi sur `localhost`.

## Moteur de voicings (résumé)

Pour chaque fenêtre de 4 cases sur le manche, chaque corde peut être étouffée,
à vide ou frettée sur une note de l'accord. Un voicing est retenu si :

- toutes les notes obligatoires sont présentes (la quinte juste est omissible,
  option activée par défaut pour les accords de 4 sons et plus) ;
- il est jouable : ≤ 4 doigts, écart ≤ 3 cases entre frettes, barré détecté
  automatiquement (aucune corde à vide/étouffée sous le barré), au plus une
  corde étouffée « interne » ;
- au moins 3 cordes jouées.

Les voicings redondants (même forme + cordes à vide en plus, même basse,
position ouverte) sont élagués. Tri : position sur le manche, puis score de
jouabilité (fondamentale à la basse, nb de doigts, écart, cordes jouées).

Accordages fournis : guitare standard, drop D, DADGAD, basse 4 et 5 cordes —
extensibles dans `TUNINGS` (midi des cordes à vide, grave → aigu).

## État partageable

La sélection est reflétée dans l'URL : `#r=0&t=maj7&a=guitar-std`
(fondamentale, type, accordage). Un lien copié rouvre le même accord.
