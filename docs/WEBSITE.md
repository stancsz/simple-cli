# Website Maintenance

## Overview
The Simple CLI website is hosted on GitHub Pages using Jekyll. The source code is located in `docs/website/`.

## Structure
*   `docs/website/`: Source directory for the Jekyll site.
*   `docs/website/api/`: Auto-generated API documentation (from `src/`).
*   `_config.yml`: Jekyll configuration file in the project root.
*   `.github/workflows/deploy-docs.yml`: CI/CD workflow for automated deployment.

## Deployment
The website is automatically deployed on every push to the `main` branch.
1.  **Build**: The workflow installs dependencies and runs `npm run build:docs` to generate API docs.
2.  **Generate**: Jekyll builds the static site from `docs/website` and the generated API docs.
3.  **Deploy**: The site is published to GitHub Pages.

## Local Development
To run the website locally:
1.  **Install Ruby & Bundler**: Ensure you have Ruby installed.
2.  **Install Gems**: `bundle install`.
3.  **Generate API Docs**: `npm run build:docs`.
4.  **Serve**: `bundle exec jekyll serve --source docs/website --destination _site`
    *   Note: You may need to run this from the project root.

## Updating Content
*   **Main Pages**: Edit markdown files in `docs/website/`.
*   **API Docs**: Do NOT edit `docs/website/api/` manually. Update JSDoc comments in `src/` and run the build script.
*   **Theme**: The site uses the `minima` theme. Override styles in `docs/website/assets/css/style.scss` if needed.
