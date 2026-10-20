#!/usr/bin/env bash
# F-Droid Panel installer: install, update, repair and remove the panel on a Linux server.
#   bash <(curl -fsSL https://raw.githubusercontent.com/Victor-root/F-Droid-Panel/main/install.sh)
# Installed as /opt/fdroid-panel/install.sh, it is also the root maintenance helper that applies
# the updates requested from the browser (--maintenance, started by a systemd path unit).
set -euo pipefail
# Some environments start shells with an empty umask; nothing installed may be writable by others.
umask 022

GITHUB_REPO="Victor-root/F-Droid-Panel"
SERVICE_USER="fdroid-panel"
INSTALL_DIR="/opt/fdroid-panel"
RELEASES_DIR="${INSTALL_DIR}/releases"
CURRENT_LINK="${INSTALL_DIR}/current"
# The fdroid command the panel uses lives in a venv named after the hash of its lock file, behind
# this link: venvs cannot be moved, so a new one is built next to the old one and the link switched.
FDROID_LINK="${INSTALL_DIR}/fdroidserver-venv"
INSTALLED_SCRIPT="${INSTALL_DIR}/install.sh"
CONFIG_DIR="/etc/fdroid-panel"
CONFIG_FILE="${CONFIG_DIR}/panel.toml"
SECRETS_DIR="${CONFIG_DIR}/secrets"
STATE_FILE="${CONFIG_DIR}/installer.env"
DEFAULT_DATA_DIR="/var/lib/fdroid-panel"
SYSTEMD_DIR="/etc/systemd/system"
PANEL_UNIT="fdroid-panel.service"
HELPER_UNIT="fdroid-panel-maintenance.service"
HELPER_PATH_UNIT="fdroid-panel-maintenance.path"
CADDYFILE="/etc/caddy/Caddyfile"
MANAGED_MARKER="# Managed by F-Droid Panel install.sh"
MIN_PYTHON="3.10"
MIN_FREE_MB=2048
DATABASE_BACKUPS_KEPT=5
APT_PACKAGES=(python3 python3-venv default-jdk-headless apksigner git ca-certificates curl)

WORK_DIR=""
cleanup_tmp() {
    [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]] && rm -rf "$WORK_DIR"
    return 0
}
trap cleanup_tmp EXIT

# ------------------------------------------------------------
# Language detection (EN default, FR if system locale starts with fr)
# ------------------------------------------------------------

detect_lang() {
    local raw="${LC_ALL:-${LC_MESSAGES:-${LANG:-en}}}"
    raw="${raw,,}"
    case "$raw" in
        fr* ) APP_LANG="fr" ;;
        * ) APP_LANG="en" ;;
    esac
}

APP_LANG="en"
detect_lang

tr_msg() {
    local key="$1"
    case "$APP_LANG:$key" in
        fr:banner_subtitle) echo "F-Droid Panel, installateur" ;;
        en:banner_subtitle) echo "F-Droid Panel installer" ;;

        fr:not_affiliated) echo "Projet indépendant, sans lien avec le projet F-Droid." ;;
        en:not_affiliated) echo "Independent project, not affiliated with the F-Droid project." ;;

        fr:host_label) echo "Machine" ;;
        en:host_label) echo "Host" ;;

        fr:detected_language) echo "Langue détectée" ;;
        en:detected_language) echo "Detected language" ;;

        fr:lang_fr) echo "Français" ;;
        en:lang_fr) echo "French" ;;

        fr:lang_en) echo "Anglais" ;;
        en:lang_en) echo "English" ;;

        fr:installed_version) echo "Version installée" ;;
        en:installed_version) echo "Installed version" ;;

        fr:not_installed) echo "pas installé" ;;
        en:not_installed) echo "not installed" ;;

        fr:menu_install) echo "Installer F-Droid Panel" ;;
        en:menu_install) echo "Install F-Droid Panel" ;;

        fr:menu_update) echo "Mettre à jour F-Droid Panel" ;;
        en:menu_update) echo "Update F-Droid Panel" ;;

        fr:menu_status) echo "Afficher l'état" ;;
        en:menu_status) echo "Show status" ;;

        fr:menu_repair) echo "Réparer (dépendances, droits, service)" ;;
        en:menu_repair) echo "Repair (dependencies, permissions, service)" ;;

        fr:menu_reset) echo "Réinitialiser un mot de passe / afficher un nouveau code d'installation" ;;
        en:menu_reset) echo "Reset a password / show a new setup code" ;;

        fr:menu_proxy) echo "Afficher la configuration du reverse proxy" ;;
        en:menu_proxy) echo "Show the reverse proxy configuration" ;;

        fr:menu_uninstall) echo "Désinstaller" ;;
        en:menu_uninstall) echo "Uninstall" ;;

        fr:menu_quit) echo "Quitter" ;;
        en:menu_quit) echo "Quit" ;;

        fr:choose_option) echo "Choisissez une option" ;;
        en:choose_option) echo "Choose an option" ;;

        fr:invalid_choice) echo "Choix invalide." ;;
        en:invalid_choice) echo "Invalid choice." ;;

        fr:press_enter) echo "Appuyez sur Entrée pour continuer..." ;;
        en:press_enter) echo "Press Enter to continue..." ;;

        fr:type_yes) echo "Tapez yes pour continuer" ;;
        en:type_yes) echo "Type yes to continue" ;;

        fr:hint_default_yes) echo "[O/n]" ;;
        en:hint_default_yes) echo "[Y/n]" ;;

        fr:hint_default_no) echo "[o/N]" ;;
        en:hint_default_no) echo "[y/N]" ;;

        fr:cancelled) echo "Annulé, rien n'a été modifié." ;;
        en:cancelled) echo "Cancelled, nothing was changed." ;;

        fr:bye) echo "Au revoir." ;;
        en:bye) echo "Bye." ;;

        fr:command_output) echo "Sortie de la commande :" ;;
        en:command_output) echo "Command output:" ;;

        fr:running_as_root) echo "Ce script doit être lancé en root (sudo -i, puis relancez la commande)." ;;
        en:running_as_root) echo "This script must run as root (sudo -i, then run the command again)." ;;

        fr:no_systemd) echo "systemd est nécessaire et ne fonctionne pas sur ce système." ;;
        en:no_systemd) echo "systemd is required and is not running on this system." ;;

        fr:missing_downloader) echo "curl ou wget est nécessaire pour télécharger F-Droid Panel." ;;
        en:missing_downloader) echo "curl or wget is needed to download F-Droid Panel." ;;

        fr:usage) echo "Utilisation : install.sh (menu interactif) ou install.sh --maintenance (service systemd)" ;;
        en:usage) echo "Usage: install.sh (interactive menu) or install.sh --maintenance (systemd service)" ;;

        fr:value_default) echo "défaut" ;;
        en:value_default) echo "default" ;;

        fr:invalid_value) echo "Valeur invalide, réessayez." ;;
        en:invalid_value) echo "Invalid value, try again." ;;

        fr:already_installed) echo "F-Droid Panel est déjà installé. Utilisez Mettre à jour ou Réparer." ;;
        en:already_installed) echo "F-Droid Panel is already installed. Use Update or Repair." ;;

        fr:not_installed_yet) echo "F-Droid Panel n'est pas installé. Choisissez d'abord Installer." ;;
        en:not_installed_yet) echo "F-Droid Panel is not installed. Choose Install first." ;;

        fr:checks_title) echo "Vérifications" ;;
        en:checks_title) echo "Checks" ;;

        fr:check_system) echo "Système" ;;
        en:check_system) echo "System" ;;

        fr:check_arch) echo "Architecture" ;;
        en:check_arch) echo "Architecture" ;;

        fr:check_python) echo "Python" ;;
        en:check_python) echo "Python" ;;

        fr:check_java) echo "Java (keytool, jarsigner)" ;;
        en:check_java) echo "Java (keytool, jarsigner)" ;;

        fr:check_disk) echo "Espace libre" ;;
        en:check_disk) echo "Free space" ;;

        fr:check_fdroid) echo "fdroid déjà présent" ;;
        en:check_fdroid) echo "Existing fdroid" ;;

        fr:check_webservers) echo "Serveurs web actifs" ;;
        en:check_webservers) echo "Running web servers" ;;

        fr:check_ports) echo "Ports 80 / 443 utilisés" ;;
        en:check_ports) echo "Ports 80 / 443 in use" ;;

        fr:check_repos) echo "Dépôts F-Droid trouvés" ;;
        en:check_repos) echo "F-Droid repositories found" ;;

        fr:state_ok) echo "ok" ;;
        en:state_ok) echo "ok" ;;

        fr:state_missing) echo "absent, sera installé" ;;
        en:state_missing) echo "missing, will be installed" ;;

        fr:state_none) echo "aucun" ;;
        en:state_none) echo "none" ;;

        fr:tier1) echo "testé" ;;
        en:tier1) echo "tested" ;;

        fr:tier2) echo "non testé, au mieux" ;;
        en:tier2) echo "not tested, best effort" ;;

        fr:fdroid_left_alone) echo "le panneau installe sa propre copie testée, celle-ci reste intacte" ;;
        en:fdroid_left_alone) echo "the panel installs its own tested copy, this one is left untouched" ;;

        fr:repos_import_hint) echo "Ils pourront être importés depuis le navigateur après l'installation." ;;
        en:repos_import_hint) echo "They can be imported from the browser after the installation." ;;

        fr:unsupported_arch) echo "Architecture non prise en charge (x86_64 ou arm64 uniquement)" ;;
        en:unsupported_arch) echo "Unsupported architecture (x86_64 or arm64 only)" ;;

        fr:python_too_old) echo "Python ${MIN_PYTHON} ou plus récent est nécessaire." ;;
        en:python_too_old) echo "Python ${MIN_PYTHON} or newer is required." ;;

        fr:not_enough_space) echo "Pas assez d'espace libre (au moins ${MIN_FREE_MB} Mo)." ;;
        en:not_enough_space) echo "Not enough free space (at least ${MIN_FREE_MB} MB)." ;;

        fr:network_failed) echo "GitHub ou PyPI injoignable. Vérifiez l'accès à Internet (et le proxy éventuel)." ;;
        en:network_failed) echo "GitHub or PyPI cannot be reached. Check the Internet access (and the proxy, if any)." ;;

        fr:no_apt_title) echo "Paquets à installer vous-même" ;;
        en:no_apt_title) echo "Packages to install yourself" ;;

        fr:no_apt_body) echo "Ce système n'utilise pas apt : installez ces outils avec son gestionnaire de paquets, puis relancez le script." ;;
        en:no_apt_body) echo "This system does not use apt: install these tools with its package manager, then run the script again." ;;

        fr:no_apt_missing) echo "Manquant" ;;
        en:no_apt_missing) echo "Missing" ;;

        fr:ask_host) echo "Adresse publique (nom de domaine ou IP) du panneau et des dépôts" ;;
        en:ask_host) echo "Public address (domain name or IP) of the panel and the repositories" ;;

        fr:https_title) echo "Comment le panneau est-il joint ?" ;;
        en:https_title) echo "How is the panel reached?" ;;

        fr:https_proxy) echo "Derrière un reverse proxy existant (nginx, Caddy, Traefik, Nginx Proxy Manager...)" ;;
        en:https_proxy) echo "Behind an existing reverse proxy (nginx, Caddy, Traefik, Nginx Proxy Manager...)" ;;

        fr:https_caddy) echo "Seul, avec Caddy et HTTPS automatique (ports 80 et 443 ouverts, DNS vers cette machine)" ;;
        en:https_caddy) echo "Standalone, with Caddy and automatic HTTPS (ports 80 and 443 open, DNS pointing here)" ;;

        fr:https_http) echo "Test sur le réseau local, en HTTP simple" ;;
        en:https_http) echo "Local network test, plain HTTP" ;;

        fr:ask_https) echo "Votre choix" ;;
        en:ask_https) echo "Your choice" ;;

        fr:ask_proxy_local) echo "Le reverse proxy tourne-t-il sur cette machine ?" ;;
        en:ask_proxy_local) echo "Does the reverse proxy run on this machine?" ;;

        fr:ask_proxy_ip) echo "Adresse IP du reverse proxy (seule autorisée à transmettre l'IP des visiteurs)" ;;
        en:ask_proxy_ip) echo "IP address of the reverse proxy (the only one allowed to pass on visitor addresses)" ;;

        fr:ask_port) echo "Port d'écoute du panneau" ;;
        en:ask_port) echo "Port the panel listens on" ;;

        fr:port_in_use) echo "Ce port est déjà utilisé sur cette machine." ;;
        en:port_in_use) echo "This port is already used on this machine." ;;

        fr:ask_data_dir) echo "Dossier des données (base, dépôts créés, sauvegardes)" ;;
        en:ask_data_dir) echo "Data directory (database, created repositories, backups)" ;;

        fr:caddy_ports_busy) echo "Un autre service utilise déjà le port 80 ou 443 : Caddy ne pourra pas démarrer. Le mode reverse proxy existant est sans doute le bon choix." ;;
        en:caddy_ports_busy) echo "Another service already uses port 80 or 443: Caddy will not be able to start. The existing reverse proxy mode is probably the right choice." ;;

        fr:caddy_dns_hint) echo "Caddy obtient le certificat tout seul si ce nom pointe vers cette machine et si les ports 80 et 443 sont joignables depuis Internet." ;;
        en:caddy_dns_hint) echo "Caddy gets the certificate by itself if this name points to this machine and ports 80 and 443 are reachable from the Internet." ;;

        fr:http_warning) echo "En HTTP simple, les mots de passe passent en clair sur le réseau : à réserver à un test local." ;;
        en:http_warning) echo "With plain HTTP, passwords cross the network unencrypted: keep it for a local test." ;;

        fr:no_stable_release) echo "Aucune version stable n'est encore publiée." ;;
        en:no_stable_release) echo "No stable release is published yet." ;;

        fr:ask_edge) echo "Installer la version de développement (edge), mise à jour à chaque modification ?" ;;
        en:ask_edge) echo "Install the development build (edge), updated on every change?" ;;

        fr:no_release) echo "Aucune version de F-Droid Panel n'a été trouvée sur GitHub." ;;
        en:no_release) echo "No release of F-Droid Panel was found on GitHub." ;;

        fr:summary_title) echo "Résumé" ;;
        en:summary_title) echo "Summary" ;;

        fr:summary_url) echo "Adresse" ;;
        en:summary_url) echo "Address" ;;

        fr:summary_mode) echo "Accès" ;;
        en:summary_mode) echo "Access" ;;

        fr:summary_listen) echo "Écoute" ;;
        en:summary_listen) echo "Listens on" ;;

        fr:summary_data) echo "Données" ;;
        en:summary_data) echo "Data" ;;

        fr:summary_channel) echo "Version" ;;
        en:summary_channel) echo "Release" ;;

        fr:summary_writes) echo "Écrit" ;;
        en:summary_writes) echo "Writes" ;;

        fr:channel_stable) echo "dernière version stable" ;;
        en:channel_stable) echo "latest stable release" ;;

        fr:channel_edge) echo "développement (edge)" ;;
        en:channel_edge) echo "development (edge)" ;;

        fr:mode_proxy) echo "reverse proxy existant" ;;
        en:mode_proxy) echo "existing reverse proxy" ;;

        fr:mode_caddy) echo "Caddy, HTTPS automatique" ;;
        en:mode_caddy) echo "Caddy, automatic HTTPS" ;;

        fr:mode_http) echo "HTTP simple, test local" ;;
        en:mode_http) echo "plain HTTP, local test" ;;

        fr:step_packages) echo "Installation des paquets système" ;;
        en:step_packages) echo "Installing system packages" ;;

        fr:step_caddy) echo "Installation de Caddy" ;;
        en:step_caddy) echo "Installing Caddy" ;;

        fr:step_user) echo "Création de l'utilisateur système ${SERVICE_USER}" ;;
        en:step_user) echo "Creating the ${SERVICE_USER} system user" ;;

        fr:step_dirs) echo "Préparation des dossiers et des droits" ;;
        en:step_dirs) echo "Preparing directories and permissions" ;;

        fr:step_download) echo "Téléchargement et vérification de F-Droid Panel" ;;
        en:step_download) echo "Downloading and verifying F-Droid Panel" ;;

        fr:step_release) echo "Installation de F-Droid Panel et de ses dépendances" ;;
        en:step_release) echo "Installing F-Droid Panel and its dependencies" ;;

        fr:step_fdroid) echo "Installation de fdroidserver" ;;
        en:step_fdroid) echo "Installing fdroidserver" ;;

        fr:step_database) echo "Préparation de la base de données" ;;
        en:step_database) echo "Preparing the database" ;;

        fr:step_units) echo "Installation des services systemd" ;;
        en:step_units) echo "Installing the systemd services" ;;

        fr:step_health) echo "Vérification que le panneau répond" ;;
        en:step_health) echo "Checking that the panel answers" ;;

        fr:step_caddy_config) echo "Configuration de Caddy" ;;
        en:step_caddy_config) echo "Configuring Caddy" ;;

        fr:step_stop) echo "Arrêt du service" ;;
        en:step_stop) echo "Stopping the service" ;;

        fr:step_db_backup) echo "Sauvegarde de la base de données" ;;
        en:step_db_backup) echo "Backing up the database" ;;

        fr:step_rollback) echo "Retour à la version précédente" ;;
        en:step_rollback) echo "Going back to the previous version" ;;

        fr:step_permissions) echo "Remise en ordre des droits" ;;
        en:step_permissions) echo "Fixing permissions" ;;

        fr:step_venv) echo "Reconstruction de l'environnement Python du panneau" ;;
        en:step_venv) echo "Rebuilding the Python environment of the panel" ;;

        fr:step_remove) echo "Suppression des fichiers" ;;
        en:step_remove) echo "Removing files" ;;

        fr:sandbox_relaxed) echo "Ce conteneur ne permet pas l'isolation systemd complète : elle a été allégée pour ce service." ;;
        en:sandbox_relaxed) echo "This container does not allow the full systemd isolation: it was relaxed for this service." ;;

        fr:install_failed) echo "L'installation s'est arrêtée. Rien n'a été supprimé : corrigez le problème affiché puis relancez Installer ou Réparer." ;;
        en:install_failed) echo "The installation stopped. Nothing was removed: fix the problem shown above, then run Install or Repair again." ;;

        fr:existing_config) echo "Configuration d'une installation précédente réutilisée" ;;
        en:existing_config) echo "Configuration of a previous installation reused" ;;

        fr:existing_accounts) echo "Connectez-vous avec vos comptes existants." ;;
        en:existing_accounts) echo "Sign in with your existing accounts." ;;

        fr:installed_title) echo "F-Droid Panel est installé" ;;
        en:installed_title) echo "F-Droid Panel is installed" ;;

        fr:open_url) echo "Ouvrez" ;;
        en:open_url) echo "Open" ;;

        fr:setup_code) echo "Code d'installation (valable 24 h, à saisir dans le navigateur pour créer le premier administrateur)" ;;
        en:setup_code) echo "Setup code (valid 24 h, type it in the browser to create the first administrator)" ;;

        fr:proxy_todo) echo "Il reste à configurer le reverse proxy : option 6 du menu." ;;
        en:proxy_todo) echo "The reverse proxy still has to be configured: option 6 of the menu." ;;

        fr:caddy_custom) echo "Votre Caddyfile est personnalisé, il n'a pas été modifié. Ajoutez ce bloc :" ;;
        en:caddy_custom) echo "Your Caddyfile is customized and was not changed. Add this block:" ;;

        fr:update_title) echo "Mise à jour" ;;
        en:update_title) echo "Update" ;;

        fr:update_from_to) echo "Version" ;;
        en:update_from_to) echo "Version" ;;

        fr:update_body) echo "Le service s'arrête quelques secondes. La base est sauvegardée, et en cas d'échec la version actuelle revient toute seule. Les dépôts ne sont pas touchés." ;;
        en:update_body) echo "The service stops for a few seconds. The database is backed up, and if anything fails the current version comes back by itself. Repositories are not touched." ;;

        fr:up_to_date) echo "F-Droid Panel est déjà à jour." ;;
        en:up_to_date) echo "F-Droid Panel is already up to date." ;;

        fr:updated) echo "F-Droid Panel est à jour" ;;
        en:updated) echo "F-Droid Panel is up to date" ;;

        fr:update_rolled_back) echo "La mise à jour a échoué : la version précédente et sa base de données ont été remises en place." ;;
        en:update_rolled_back) echo "The update failed: the previous version and its database were put back." ;;

        fr:rollback_failed) echo "Le retour en arrière a aussi échoué. La base sauvegardée est ici :" ;;
        en:rollback_failed) echo "Going back failed too. The database backup is here:" ;;

        fr:status_title) echo "État de F-Droid Panel" ;;
        en:status_title) echo "F-Droid Panel status" ;;

        fr:status_service) echo "Service" ;;
        en:status_service) echo "Service" ;;

        fr:status_version) echo "Version" ;;
        en:status_version) echo "Version" ;;

        fr:status_url) echo "Adresse" ;;
        en:status_url) echo "Address" ;;

        fr:status_listen) echo "Écoute" ;;
        en:status_listen) echo "Listens on" ;;

        fr:status_repos) echo "Dépôts" ;;
        en:status_repos) echo "Repositories" ;;

        fr:status_fdroid) echo "fdroidserver" ;;
        en:status_fdroid) echo "fdroidserver" ;;

        fr:status_helper) echo "Mises à jour depuis le navigateur" ;;
        en:status_helper) echo "Updates from the browser" ;;

        fr:status_disk) echo "Espace utilisé" ;;
        en:status_disk) echo "Disk usage" ;;

        fr:status_caddy) echo "Caddy" ;;
        en:status_caddy) echo "Caddy" ;;

        fr:status_active) echo "actif" ;;
        en:status_active) echo "running" ;;

        fr:status_inactive) echo "arrêté" ;;
        en:status_inactive) echo "stopped" ;;

        fr:status_broken) echo "ne démarre pas" ;;
        en:status_broken) echo "does not start" ;;

        fr:repaired) echo "Réparation terminée, le panneau répond." ;;
        en:repaired) echo "Repair finished, the panel answers." ;;

        fr:reset_title) echo "Comptes" ;;
        en:reset_title) echo "Accounts" ;;

        fr:no_accounts) echo "Aucun compte n'existe encore : voici un nouveau code d'installation." ;;
        en:no_accounts) echo "No account exists yet: here is a new setup code." ;;

        fr:ask_username) echo "Compte dont le mot de passe doit être remplacé" ;;
        en:ask_username) echo "Account whose password is replaced" ;;

        fr:unknown_username) echo "Ce compte n'existe pas." ;;
        en:unknown_username) echo "This account does not exist." ;;

        fr:ask_disable_2fa) echo "Désactiver aussi la vérification en deux étapes de ce compte ?" ;;
        en:ask_disable_2fa) echo "Also turn off two-step verification for this account?" ;;

        fr:new_password) echo "Nouveau mot de passe (changez-le après la connexion, dans Paramètres)" ;;
        en:new_password) echo "New password (change it after signing in, in Settings)" ;;

        fr:sessions_ended) echo "Les sessions ouvertes de ce compte ont été fermées." ;;
        en:sessions_ended) echo "The open sessions of this account were ended." ;;

        fr:proxy_title) echo "Configuration du reverse proxy" ;;
        en:proxy_title) echo "Reverse proxy configuration" ;;

        fr:proxy_intro) echo "Le proxy doit transmettre tout le nom de domaine au panneau, qui sert l'interface, l'API et les dépôts." ;;
        en:proxy_intro) echo "The proxy must forward the whole host name to the panel, which serves the interface, the API and the repositories." ;;

        fr:proxy_npm) echo "Nginx Proxy Manager : hôte proxy vers cette adresse, puis dans Advanced ajoutez" ;;
        en:proxy_npm) echo "Nginx Proxy Manager: proxy host to this address, then in Advanced add" ;;

        fr:proxy_trusted) echo "Adresses de proxy acceptées par le panneau" ;;
        en:proxy_trusted) echo "Proxy addresses the panel trusts" ;;

        fr:uninstall_title) echo "Désinstallation" ;;
        en:uninstall_title) echo "Uninstall" ;;

        fr:uninstall_keep) echo "Retirer le service et l'application, garder les données, la configuration et tous les dépôts" ;;
        en:uninstall_keep) echo "Remove the service and the application, keep the data, the configuration and every repository" ;;

        fr:uninstall_all) echo "Tout retirer, y compris les données (les dépôts restent sauf confirmation un par un)" ;;
        en:uninstall_all) echo "Remove everything, including the data (repositories stay unless confirmed one by one)" ;;

        fr:uninstall_cancel) echo "Annuler" ;;
        en:uninstall_cancel) echo "Cancel" ;;

        fr:uninstall_all_warning) echo "La base de données, les comptes, les sauvegardes et la configuration seront supprimés. Les mots de passe des keystores sont d'abord remis dans le config.yml de chaque dépôt." ;;
        en:uninstall_all_warning) echo "The database, the accounts, the backups and the configuration are deleted. Keystore passwords are first written back into each repository's config.yml." ;;

        fr:repo_kept) echo "Dépôt conservé" ;;
        en:repo_kept) echo "Repository kept" ;;

        fr:repo_deleted) echo "Dépôt supprimé" ;;
        en:repo_deleted) echo "Repository deleted" ;;

        fr:ask_delete_repo) echo "Pour SUPPRIMER ce dépôt (clés et APK compris), tapez son chemin exact. Entrée pour le garder" ;;
        en:ask_delete_repo) echo "To DELETE this repository (keys and APKs included), type its exact path. Enter keeps it" ;;

        fr:repos_now_root) echo "Les dépôts conservés appartiennent maintenant à root." ;;
        en:repos_now_root) echo "The kept repositories now belong to root." ;;

        fr:passwords_restored) echo "Mots de passe des keystores remis dans config.yml" ;;
        en:passwords_restored) echo "Keystore passwords written back into config.yml" ;;

        fr:uninstalled) echo "F-Droid Panel a été retiré." ;;
        en:uninstalled) echo "F-Droid Panel was removed." ;;

        fr:kept_paths) echo "Conservé" ;;
        en:kept_paths) echo "Kept" ;;

        fr:reinstall_hint) echo "Relancez Installer pour le remettre avec les mêmes données." ;;
        en:reinstall_hint) echo "Run Install again to bring it back with the same data." ;;

        * ) echo "$key" ;;
    esac
}

APP_NAME="$(tr_msg banner_subtitle)"

# ------------------------------------------------------------
# Colors (Android green as the accent color), same visual engine as
# the Proxmox-Tools scripts.
# ------------------------------------------------------------

if [[ -t 1 ]]; then
    RESET='\033[0m'
    BOLD='\033[1m'

    ACCENT='\033[38;5;78m'
    ACCENT_DARK='\033[38;5;29m'
    ACCENT_SOFT='\033[38;5;114m'
    C_RED='\033[38;5;160m'
    C_AMBER='\033[38;5;214m'
    C_GREEN='\033[38;5;77m'
    C_CYAN='\033[38;5;73m'
    C_BLUE='\033[38;5;67m'
    C_GREY='\033[38;5;244m'
else
    RESET=''
    BOLD=''

    ACCENT=''
    ACCENT_DARK=''
    ACCENT_SOFT=''
    C_RED=''
    C_AMBER=''
    C_GREEN=''
    C_CYAN=''
    C_BLUE=''
    C_GREY=''
fi

term_width() {
    local cols
    cols="$(tput cols 2>/dev/null || echo 80)"
    [[ -z "$cols" || "$cols" -lt 50 ]] && cols=80
    [[ "$cols" -gt 92 ]] && cols=92
    echo "$cols"
}

hr() {
    local cols line
    cols="$(term_width)"
    # Bash substitution instead of tr: tr works on bytes and would turn a
    # multi byte box character into garbage.
    printf -v line "%*s" "$cols" ""
    printf "%b%s%b\n" "${ACCENT_DARK}" "${line// /─}" "${RESET}"
}

panel() {
    local color="$1"
    local title="$2"
    shift 2

    echo
    printf "%b┌%b %b%b%s%b\n" "$color" "$RESET" "$BOLD" "$color" "$title" "$RESET"
    while (($#)); do
        printf "%b│%b %b\n" "$color" "$RESET" "$1"
        shift
    done
    printf "%b└%b\n" "$color" "$RESET"
}

say_info() { printf "%b›%b %b\n" "${ACCENT_SOFT}" "${RESET}" "$*"; }
say_ok()   { printf "%b✓%b %b\n" "${C_GREEN}" "${RESET}" "$*"; }
say_warn() { printf "%b⚠%b %b\n" "${C_AMBER}" "${RESET}" "$*"; }
say_err()  { printf "%b✗%b %b\n" "${C_RED}" "${RESET}" "$*" >&2; }

SPINNER_FRAMES=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")

# Long commands (download, apt, pip) run behind a spinner: their output is only
# shown when they fail, so a normal run stays readable.
step() {
    local label="$1"
    shift

    local log rc=0
    log="$(mktemp)"

    if [[ -t 1 ]]; then
        "$@" >"$log" 2>&1 &
        local pid=$!
        local i=0
        while kill -0 "$pid" 2>/dev/null; do
            printf "\r%b%s%b %b%s…%b" \
                "${ACCENT_SOFT}" "${SPINNER_FRAMES[i]}" "${RESET}" \
                "${C_GREY}" "$label" "${RESET}"
            i=$(((i + 1) % ${#SPINNER_FRAMES[@]}))
            sleep 0.08
        done
        wait "$pid" || rc=$?
        if [[ "$rc" -eq 0 ]]; then
            printf "\r\033[2K%b✓%b %s\n" "${C_GREEN}" "${RESET}" "$label"
        else
            printf "\r\033[2K%b✗%b %s\n" "${C_RED}" "${RESET}" "$label"
        fi
    else
        printf "%b›%b %s\n" "${ACCENT_SOFT}" "${RESET}" "$label"
        "$@" >"$log" 2>&1 || rc=$?
        if [[ "$rc" -eq 0 ]]; then
            printf "%b✓%b %s\n" "${C_GREEN}" "${RESET}" "$label"
        else
            printf "%b✗%b %s\n" "${C_RED}" "${RESET}" "$label"
        fi
    fi

    if [[ "$rc" -ne 0 ]]; then
        echo
        say_err "$(tr_msg command_output)"
        sed -e 's/^/  /' "$log" >&2
        rm -f "$log"
        return "$rc"
    fi

    rm -f "$log"
    return 0
}

banner() {
    clear 2>/dev/null || true
    echo
    printf "%b%s%b\n" "${ACCENT}" '███████╗      ██████╗ ██████╗  ██████╗ ██╗██████╗ ' "${RESET}"
    printf "%b%s%b\n" "${ACCENT}" '██╔════╝      ██╔══██╗██╔══██╗██╔═══██╗██║██╔══██╗' "${RESET}"
    printf "%b%s%b\n" "${ACCENT}" '█████╗  █████╗██║  ██║██████╔╝██║   ██║██║██║  ██║' "${RESET}"
    printf "%b%s%b\n" "${ACCENT}" '██╔══╝  ╚════╝██║  ██║██╔══██╗██║   ██║██║██║  ██║' "${RESET}"
    printf "%b%s%b\n" "${ACCENT}" '██║           ██████╔╝██║  ██║╚██████╔╝██║██████╔╝' "${RESET}"
    printf "%b%s%b\n" "${ACCENT}" '╚═╝           ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝╚═════╝ ' "${RESET}"
    echo
    printf "  %b%s%b %b· by Victor-root%b\n" "${BOLD}${ACCENT_SOFT}" "$APP_NAME" "${RESET}" "${C_GREY}" "${RESET}"
    hr
}

show_banner() {
    banner

    local lang_label version
    if [[ "$APP_LANG" == "fr" ]]; then
        lang_label="$(tr_msg lang_fr)"
    else
        lang_label="$(tr_msg lang_en)"
    fi
    if is_installed; then
        version="$(release_label "${CURRENT_LINK}/RELEASE")"
    else
        version="${C_GREY}$(tr_msg not_installed)${RESET}"
    fi

    panel "$C_BLUE" "$(tr_msg not_affiliated)" \
        "$(tr_msg host_label): ${BOLD}$(hostname)${RESET}" \
        "$(tr_msg detected_language): ${BOLD}${lang_label}${RESET}" \
        "$(tr_msg installed_version): ${BOLD}${version}${RESET}"
    echo
}

pause() {
    echo
    read -r -p "$(tr_msg press_enter)" _ || true
}

confirm_yes() {
    local answer
    echo
    printf "%b?%b %b%s%b : " "${C_AMBER}" "${RESET}" "${BOLD}" "$(tr_msg type_yes)" "${RESET}"
    read -r answer || return 1
    [[ "$answer" == "yes" ]]
}

confirm_default() {
    local label="$1" default="$2" value hint
    if [[ "$default" == "yes" ]]; then hint="$(tr_msg hint_default_yes)"; else hint="$(tr_msg hint_default_no)"; fi
    printf "%b?%b %b%s%b %b%s%b : " \
        "${C_AMBER}" "${RESET}" \
        "${BOLD}" "$label" "${RESET}" \
        "${C_GREY}" "$hint" "${RESET}"
    IFS= read -r value || value=""
    value="${value:-$default}"
    value="${value,,}"
    [[ "$value" == "y" || "$value" == "yes" || "$value" == "o" || "$value" == "oui" ]]
}

prompt_free() {
    local label="$1" value
    printf "%b?%b %b%s%b : " \
        "${ACCENT_SOFT}" "${RESET}" \
        "${BOLD}" "$label" "${RESET}" >&2
    IFS= read -r value || value=""
    printf "%s" "$value"
}

# Asks until the validator accepts the answer; Enter keeps the default.
ask_value() {
    local label="$1" default="$2" validator="$3" value
    while true; do
        printf "%b?%b %b%s%b %b[%s: %s]%b : " \
            "${ACCENT_SOFT}" "${RESET}" "${BOLD}" "$label" "${RESET}" \
            "${C_GREY}" "$(tr_msg value_default)" "$default" "${RESET}" >&2
        IFS= read -r value || value=""
        value="${value:-$default}"
        if "$validator" "$value"; then
            printf "%s" "$value"
            return 0
        fi
        say_err "$(tr_msg invalid_value)"
    done
}

# ------------------------------------------------------------
# Validators
# ------------------------------------------------------------

valid_host() {
    [[ "${#1}" -le 253 && "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]
}

valid_port() {
    [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

valid_ip() {
    python3 -I -c 'import ipaddress, sys; ipaddress.ip_address(sys.argv[1])' "$1" 2>/dev/null
}

valid_data_dir() {
    [[ "$1" =~ ^/[A-Za-z0-9._/-]+$ && "$1" != *..* ]] || return 1
    case "${1%/}" in
        /bin*|/boot*|/dev*|/etc*|/lib*|/proc*|/root*|/run*|/sbin*|/sys*|/usr*|"$INSTALL_DIR"*) return 1 ;;
        /home|/opt|/srv|/tmp|/var|/var/lib) return 1 ;;
    esac
    return 0
}

valid_mode() {
    [[ "$1" =~ ^[123]$ ]]
}

# ------------------------------------------------------------
# Requirements
# ------------------------------------------------------------

require_root() {
    if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
        say_err "$(tr_msg running_as_root)"
        exit 1
    fi
}

require_systemd() {
    if [[ ! -d /run/systemd/system ]] || ! command -v systemctl >/dev/null 2>&1; then
        say_err "$(tr_msg no_systemd)"
        exit 1
    fi
}

require_downloader() {
    if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
        say_err "$(tr_msg missing_downloader)"
        return 1
    fi
}

is_installed() {
    [[ -L "$CURRENT_LINK" && -f "$CONFIG_FILE" ]]
}

require_installed() {
    if ! is_installed; then
        say_err "$(tr_msg not_installed_yet)"
        return 1
    fi
}

# ------------------------------------------------------------
# System detection
# ------------------------------------------------------------

os_release_value() {
    local key="$1"
    [[ -r /etc/os-release ]] || return 0
    # shellcheck disable=SC1091
    (. /etc/os-release && printf "%s" "${!key:-}")
}

is_tier1() {
    local id version
    id="$(os_release_value ID)"
    version="$(os_release_value VERSION_ID)"
    case "$id:$version" in
        debian:12|debian:13|ubuntu:22.04|ubuntu:24.04) return 0 ;;
    esac
    return 1
}

python_version() {
    python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || true
}

python_is_recent() {
    python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null
}

free_mb() {
    local path="$1"
    while [[ ! -d "$path" ]]; do path="$(dirname "$path")"; done
    df -Pm "$path" | awk 'NR == 2 { print $4 }'
}

port_in_use() {
    ss -ltnH 2>/dev/null | awk '{ print $4 }' | grep -Eq "[:.]$1\$"
}

active_web_servers() {
    local service found=()
    for service in nginx apache2 httpd caddy traefik haproxy lighttpd; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            found+=("$service")
        fi
    done
    echo "${found[*]:-}"
}

busy_web_ports() {
    local port found=()
    for port in 80 443; do
        if port_in_use "$port"; then
            found+=("$port")
        fi
    done
    echo "${found[*]:-}"
}

# Detection only: the panel never modifies a repository before the user imports it in the browser.
find_repositories() {
    local config dir
    while IFS= read -r config; do
        dir="$(dirname "$config")"
        if [[ "$dir" != "$INSTALL_DIR"* && -d "$dir/repo" ]]; then
            echo "$dir"
        fi
    done < <(find /srv /var/www /opt /home -maxdepth 4 -name config.yml -type f 2>/dev/null | sort | head -n 20)
}

default_ip() {
    hostname -I 2>/dev/null | awk '{ print $1 }'
}

default_fqdn() {
    local name
    name="$(hostname -f 2>/dev/null || hostname)"
    if valid_host "$name"; then
        echo "$name"
    else
        default_ip
    fi
}

# ------------------------------------------------------------
# Downloads and releases
# ------------------------------------------------------------

download_file() {
    local url="$1" dest="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --retry 3 --max-time 300 -o "$dest" "$url"
    else
        wget -q --tries=3 --timeout=300 -O "$dest" "$url"
    fi
}

url_exists() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --max-time 30 -o /dev/null "$1"
    else
        wget -q --spider --timeout=30 "$1"
    fi
}

network_ok() {
    url_exists "https://github.com/${GITHUB_REPO}" && url_exists "https://pypi.org/simple/pip/"
}

release_url() {
    local channel="$1" file="$2"
    if [[ "$channel" == "edge" ]]; then
        echo "https://github.com/${GITHUB_REPO}/releases/download/edge/${file}"
    else
        echo "https://github.com/${GITHUB_REPO}/releases/latest/download/${file}"
    fi
}

# FDROID_PANEL_RELEASE points to a local fdroid-panel.tar.gz with its SHA256SUMS next to it, for
# servers without access to GitHub and for the installer tests.
local_release() {
    [[ -n "${FDROID_PANEL_RELEASE:-}" ]]
}

channel_available() {
    if local_release; then
        return 0
    fi
    url_exists "$(release_url "$1" SHA256SUMS)"
}

# Downloads the archive of a channel into a directory and checks it against SHA256SUMS.
fetch_release() {
    local channel="$1" dest="$2"
    mkdir -p "$dest"
    if local_release; then
        cp "$FDROID_PANEL_RELEASE" "$dest/fdroid-panel.tar.gz"
        cp "$(dirname "$FDROID_PANEL_RELEASE")/SHA256SUMS" "$dest/SHA256SUMS"
    else
        download_file "$(release_url "$channel" SHA256SUMS)" "$dest/SHA256SUMS" || return 1
        download_file "$(release_url "$channel" fdroid-panel.tar.gz)" "$dest/fdroid-panel.tar.gz" || return 1
    fi
    (cd "$dest" && grep -E '  fdroid-panel\.tar\.gz$' SHA256SUMS | sha256sum -c --status -) || {
        echo "SHA256 checksum mismatch for fdroid-panel.tar.gz"
        return 1
    }
    tar -xzf "$dest/fdroid-panel.tar.gz" -C "$dest" --no-same-owner || return 1
    [[ -f "$dest/fdroid-panel/RELEASE" ]] || { echo "RELEASE file missing from the archive"; return 1; }
}

release_field() {
    local file="$1" key="$2"
    sed -n "s/^${key}=//p" "$file" 2>/dev/null | head -n 1
}

# Name of a release directory: version and commit, so two edge builds of one version differ.
release_id() {
    local file="$1"
    printf "%s-%s" "$(release_field "$file" version)" "$(release_field "$file" commit | cut -c1-12)"
}

release_label() {
    local file="$1"
    printf "%s (%s, %s)" "$(release_field "$file" version)" "$(release_field "$file" channel)" \
        "$(release_field "$file" commit | cut -c1-7)"
}

current_release_id() {
    basename "$(readlink "$CURRENT_LINK")"
}

new_work_dir() {
    cleanup_tmp
    WORK_DIR="$(mktemp -d)"
}

# ------------------------------------------------------------
# Configuration file
# ------------------------------------------------------------

config_string() {
    sed -n "s/^$1 = \"\(.*\)\"\$/\1/p" "$CONFIG_FILE" 2>/dev/null | head -n 1
}

config_port() {
    sed -n 's/^port = \([0-9]*\)$/\1/p' "$CONFIG_FILE" 2>/dev/null | head -n 1
}

config_trusted() {
    sed -n 's/^trusted_proxies = \[\(.*\)\]$/\1/p' "$CONFIG_FILE" 2>/dev/null | tr -d '"' | head -n 1
}

data_dir() {
    local value
    value="$(config_string data_dir)"
    echo "${value:-$DEFAULT_DATA_DIR}"
}

maintenance_dir() {
    local value
    value="$(config_string maintenance_dir)"
    echo "${value:-$(data_dir)/maintenance}"
}

state_value() {
    sed -n "s/^$1=//p" "$STATE_FILE" 2>/dev/null | head -n 1
}

# Address the installer itself uses to reach the panel.
local_url() {
    local host port
    host="$(config_string host)"
    port="$(config_port)"
    case "$host" in
        ""|0.0.0.0|127.0.0.1) host="127.0.0.1" ;;
        ::|::1) host="[::1]" ;;
        *:*) host="[$host]" ;;
    esac
    echo "http://${host}:${port:-8080}"
}

write_config() {
    local public_url="$1" host="$2" port="$3" data="$4" trusted="$5"
    cat > "${CONFIG_FILE}.new" <<EOF
# F-Droid Panel startup configuration, written by install.sh.
# Everything else is set in the browser. Restart the service after a change:
#   systemctl restart ${PANEL_UNIT}
public_url = "${public_url}"
host = "${host}"
port = ${port}
data_dir = "${data}"
secrets_dir = "${SECRETS_DIR}"
maintenance_dir = "${data}/maintenance"
fdroid_command = "${FDROID_LINK}/bin/fdroid"
trusted_proxies = [${trusted}]
EOF
    chown root:"$SERVICE_USER" "${CONFIG_FILE}.new"
    chmod 0640 "${CONFIG_FILE}.new"
    mv -f "${CONFIG_FILE}.new" "$CONFIG_FILE"
}

write_state() {
    local mode="$1" caddy_installed="$2"
    cat > "$STATE_FILE" <<EOF
HTTPS_MODE=${mode}
CADDY_INSTALLED_BY_PANEL=${caddy_installed}
EOF
    chmod 0640 "$STATE_FILE"
}

# ------------------------------------------------------------
# Installation steps
# ------------------------------------------------------------

install_packages() {
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -q || return 1
    apt-get install -y -q --no-install-recommends "${APT_PACKAGES[@]}" || return 1
}

# Tools the panel needs, checked on systems without apt.
missing_tools() {
    local tool missing=()
    for tool in python3 git keytool jarsigner apksigner; do
        command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
    done
    python3 -c 'import venv, ensurepip' 2>/dev/null || missing+=("python3-venv")
    echo "${missing[*]:-}"
}

caddy_present() {
    command -v caddy >/dev/null 2>&1
}

# Ubuntu 22.04 has no caddy package: Caddy's official repository is used there.
install_caddy() {
    export DEBIAN_FRONTEND=noninteractive
    local candidate
    candidate="$(apt-cache policy caddy 2>/dev/null | sed -n 's/^ *Candidate: //p')"
    if [[ -z "$candidate" || "$candidate" == "(none)" ]]; then
        apt-get install -y -q --no-install-recommends gnupg debian-archive-keyring || return 1
        curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
            | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg || return 1
        curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
            -o /etc/apt/sources.list.d/caddy-stable.list || return 1
        apt-get update -q || return 1
    fi
    apt-get install -y -q caddy || return 1
}

create_service_user() {
    local data="$1" nologin
    if id "$SERVICE_USER" >/dev/null 2>&1; then
        return 0
    fi
    nologin="$(command -v nologin || echo /usr/sbin/nologin)"
    useradd --system --user-group --home-dir "$data" --no-create-home --shell "$nologin" "$SERVICE_USER"
}

prepare_directories() {
    local data="$1"
    install -d -m 0755 -o root -g root "$INSTALL_DIR" "$RELEASES_DIR" || return 1
    install -d -m 0750 -o root -g "$SERVICE_USER" "$CONFIG_DIR" || return 1
    install -d -m 0700 -o "$SERVICE_USER" -g "$SERVICE_USER" "$SECRETS_DIR" || return 1
    install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_USER" "$data" || return 1
    # The panel writes requests, root writes results: the panel must not be able to replace them.
    install -d -m 0750 -o root -g "$SERVICE_USER" "$data/maintenance" || return 1
    install -d -m 0700 -o "$SERVICE_USER" -g "$SERVICE_USER" "$data/maintenance/requests" || return 1
    install -d -m 0750 -o root -g "$SERVICE_USER" "$data/maintenance/results" || return 1
}

pip_install() {
    local venv="$1"
    shift
    PIP_DISABLE_PIP_VERSION_CHECK=1 "$venv/bin/pip" install --quiet --no-cache-dir "$@"
}

# Builds the venv of a release directory from the files kept in it (wheel and locked dependencies).
build_release_venv() {
    local dir="$1"
    rm -rf "$dir/venv"
    python3 -m venv "$dir/venv" || return 1
    pip_install "$dir/venv" --require-hashes -r "$dir/pip-requirements.txt" || return 1
    pip_install "$dir/venv" --require-hashes -r "$dir/panel-requirements.txt" || return 1
    pip_install "$dir/venv" --no-deps "$dir"/fdroid_panel-*.whl || return 1
}

install_release() {
    local src="$1" dir
    dir="${RELEASES_DIR}/$(release_id "$src/RELEASE")"
    rm -rf "$dir"
    install -d -m 0755 "$dir"
    cp "$src"/RELEASE "$src"/install.sh "$src"/*.txt "$src"/fdroid_panel-*.whl "$dir/" || return 1
    build_release_venv "$dir" || { rm -rf "$dir"; return 1; }
}

switch_current() {
    local id="$1"
    ln -sfn "releases/${id}" "${CURRENT_LINK}.new"
    mv -Tf "${CURRENT_LINK}.new" "$CURRENT_LINK"
}

install_script_copy() {
    install -m 0755 -o root -g root "${CURRENT_LINK}/install.sh" "${INSTALLED_SCRIPT}.new"
    mv -f "${INSTALLED_SCRIPT}.new" "$INSTALLED_SCRIPT"
}

fdroid_dir_for() {
    printf "%s/fdroidserver-%s" "$INSTALL_DIR" "$(sha256sum "$1" | cut -c1-12)"
}

fdroid_works() {
    "$1/bin/fdroid" --version >/dev/null 2>&1
}

# Installs the locked fdroidserver of a release and points the link to it; an existing working venv
# with the same lock is reused. The previous venv stays until remove_unused_fdroidserver, so an
# update can still go back to it.
install_fdroidserver() {
    local lock="$1" pip_lock="$2" force="${3:-no}" dir
    dir="$(fdroid_dir_for "$lock")"
    if [[ "$force" == "yes" || ! -x "$dir/bin/fdroid" ]] || ! fdroid_works "$dir"; then
        rm -rf "$dir"
        python3 -m venv "$dir" || return 1
        pip_install "$dir" --require-hashes -r "$pip_lock" || { rm -rf "$dir"; return 1; }
        pip_install "$dir" --require-hashes -r "$lock" || { rm -rf "$dir"; return 1; }
        fdroid_works "$dir" || { rm -rf "$dir"; return 1; }
    fi
    point_fdroid_link "$(basename "$dir")"
}

point_fdroid_link() {
    ln -sfn "$1" "${FDROID_LINK}.new"
    mv -Tf "${FDROID_LINK}.new" "$FDROID_LINK"
}

remove_unused_fdroidserver() {
    local used dir
    used="$(readlink "$FDROID_LINK" 2>/dev/null || true)"
    for dir in "$INSTALL_DIR"/fdroidserver-*; do
        if [[ -d "$dir" && ! -L "$dir" && "$(basename "$dir")" != "$used" ]]; then
            rm -rf "$dir"
        fi
    done
}

fdroid_version() {
    "$FDROID_LINK/bin/fdroid" --version 2>/dev/null | head -n 1 || true
}

panel_cli() {
    (cd / && runuser -u "$SERVICE_USER" -- env FDROID_PANEL_CONFIG="$CONFIG_FILE" HOME="$(data_dir)" \
        "${CURRENT_LINK}/venv/bin/fdroid-panel" "$@")
}

migrate_database() {
    panel_cli migrate
}

panel_unit_content() {
    local port="$1" capabilities=""
    if (( 10#$port < 1024 )); then
        capabilities=$'AmbientCapabilities=CAP_NET_BIND_SERVICE\nCapabilityBoundingSet=CAP_NET_BIND_SERVICE'
    else
        capabilities=$'AmbientCapabilities=\nCapabilityBoundingSet='
    fi
    cat <<EOF
${MANAGED_MARKER}
[Unit]
Description=F-Droid Panel
Documentation=https://github.com/${GITHUB_REPO}
After=network-online.target
Wants=network-online.target

[Service]
Type=exec
User=${SERVICE_USER}
Group=${SERVICE_USER}
Environment=FDROID_PANEL_CONFIG=${CONFIG_FILE}
ExecStart=${CURRENT_LINK}/venv/bin/fdroid-panel serve
Restart=on-failure
RestartSec=5
UMask=0027
${capabilities}
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ReadWritePaths=${SECRETS_DIR}
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
RestrictSUIDSGID=yes
RestrictRealtime=yes
LockPersonality=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
SystemCallArchitectures=native

[Install]
WantedBy=multi-user.target
EOF
}

write_units() {
    local data="$1" port="$2"
    panel_unit_content "$port" > "${SYSTEMD_DIR}/${PANEL_UNIT}"
    cat > "${SYSTEMD_DIR}/${HELPER_PATH_UNIT}" <<EOF
${MANAGED_MARKER}
[Unit]
Description=F-Droid Panel maintenance requests

[Path]
DirectoryNotEmpty=${data}/maintenance/requests
Unit=${HELPER_UNIT}

[Install]
WantedBy=paths.target
EOF
    cat > "${SYSTEMD_DIR}/${HELPER_UNIT}" <<EOF
${MANAGED_MARKER}
[Unit]
Description=F-Droid Panel maintenance helper (updates requested from the browser)

[Service]
Type=oneshot
ExecStart=/bin/bash ${INSTALLED_SCRIPT} --maintenance
EOF
    systemctl daemon-reload || return 1
    systemctl enable --quiet "$PANEL_UNIT" "$HELPER_PATH_UNIT" || return 1
    systemctl restart "$HELPER_PATH_UNIT" || return 1
}

# Unprivileged containers without nesting refuse the mount namespaces of the sandboxing options
# (exit status 226/NAMESPACE): they are turned off for this service only, the rest stays.
relax_sandbox_if_needed() {
    local status
    status="$(systemctl show -p ExecMainStatus --value "$PANEL_UNIT" 2>/dev/null || true)"
    [[ "$status" == "226" ]] || return 1
    install -d -m 0755 "${SYSTEMD_DIR}/${PANEL_UNIT}.d"
    cat > "${SYSTEMD_DIR}/${PANEL_UNIT}.d/10-container.conf" <<EOF
${MANAGED_MARKER}
[Service]
PrivateTmp=no
ProtectSystem=no
ReadWritePaths=
ProtectKernelTunables=no
ProtectKernelModules=no
ProtectKernelLogs=no
ProtectControlGroups=no
ProtectClock=no
ProtectHostname=no
EOF
    systemctl daemon-reload
}

wait_healthy() {
    local url attempt
    url="$(local_url)/admin/api/health"
    for attempt in $(seq 1 60); do
        if command -v curl >/dev/null 2>&1; then
            curl -fsS --max-time 3 -o /dev/null "$url" 2>/dev/null && return 0
        else
            wget -q --timeout=3 -O /dev/null "$url" 2>/dev/null && return 0
        fi
        # A service that keeps crashing will not answer: systemd counts its automatic restarts.
        if [[ "$(systemctl show -p NRestarts --value "$PANEL_UNIT" 2>/dev/null || echo 0)" -ge 3 \
            || "$(systemctl is-active "$PANEL_UNIT" 2>/dev/null)" == "failed" ]] && [[ "$attempt" -gt 2 ]]; then
            break
        fi
        sleep 1
    done
    systemctl status --no-pager --lines=20 "$PANEL_UNIT" 2>&1 || true
    return 1
}

start_panel() {
    systemctl restart "$PANEL_UNIT" || true
    if wait_healthy >/dev/null 2>&1; then
        return 0
    fi
    if relax_sandbox_if_needed; then
        say_warn "$(tr_msg sandbox_relaxed)"
        systemctl restart "$PANEL_UNIT" || true
    fi
    step "$(tr_msg step_health)" wait_healthy
}

caddy_block() {
    local host="$1" port="$2"
    cat <<EOF
${host} {
    reverse_proxy 127.0.0.1:${port}
}
EOF
}

caddyfile_is_stock() {
    [[ ! -s "$CADDYFILE" ]] && return 0
    grep -q '^:80 {' "$CADDYFILE" && grep -q 'root \* /usr/share/caddy' "$CADDYFILE"
}

# Returns 2 when the Caddyfile is customized: it is left alone and the block is shown instead.
configure_caddy() {
    local host="$1" port="$2"
    if grep -qF "$MANAGED_MARKER" "$CADDYFILE" 2>/dev/null; then
        :
    elif caddyfile_is_stock; then
        if [[ -f "$CADDYFILE" && ! -f "${CONFIG_DIR}/Caddyfile.original" ]]; then
            cp -p "$CADDYFILE" "${CONFIG_DIR}/Caddyfile.original"
        fi
    else
        return 2
    fi
    install -d -m 0755 "$(dirname "$CADDYFILE")"
    { echo "$MANAGED_MARKER"; caddy_block "$host" "$port"; } > "$CADDYFILE"
    systemctl enable --quiet caddy || return 1
    systemctl reload-or-restart caddy || return 1
}

new_setup_code() {
    panel_cli setup-code
}

json_string() {
    python3 -I -c 'import json, sys; print(json.dumps(sys.argv[1]))' "$1"
}

# What the browser shows on the System page (read by the panel, written by root only).
write_helper_state() {
    local dir file release="${CURRENT_LINK}/RELEASE"
    dir="$(maintenance_dir)"
    [[ -d "$dir" ]] || return 0
    file="$dir/helper.json"
    cat > "${file}.new" <<EOF
{"version": $(json_string "$(release_field "$release" version)"), "channel": $(json_string "$(release_field "$release" channel)"), "commit": $(json_string "$(release_field "$release" commit)"), "fdroidserver": $(json_string "$(fdroid_version)")}
EOF
    chown root:"$SERVICE_USER" "${file}.new"
    chmod 0640 "${file}.new"
    mv -f "${file}.new" "$file"
}

# ------------------------------------------------------------
# Install
# ------------------------------------------------------------

show_checks() {
    local id version_name arch python free tier ok_word missing_word web ports fdroid_line repos java
    id="$(os_release_value ID)"
    version_name="$(os_release_value PRETTY_NAME)"
    arch="$(uname -m)"
    ok_word="${C_GREEN}$(tr_msg state_ok)${RESET}"
    missing_word="${C_AMBER}$(tr_msg state_missing)${RESET}"

    if is_tier1; then tier="${C_GREEN}$(tr_msg tier1)${RESET}"; else tier="${C_AMBER}$(tr_msg tier2)${RESET}"; fi
    python="$(python_version)"
    if command -v keytool >/dev/null 2>&1 && command -v jarsigner >/dev/null 2>&1; then java="$ok_word"; else java="$missing_word"; fi
    free="$(free_mb /opt)"
    web="$(active_web_servers)"
    ports="$(busy_web_ports)"
    if command -v fdroid >/dev/null 2>&1; then
        fdroid_line="$(fdroid --version 2>/dev/null | head -n 1), $(tr_msg fdroid_left_alone)"
    else
        fdroid_line="$(tr_msg state_none)"
    fi
    repos="$(find_repositories | tr '\n' ' ')"

    panel "$ACCENT" "$(tr_msg checks_title)" \
        "$(tr_msg check_system): ${BOLD}${version_name:-$id}${RESET} (${tier})" \
        "$(tr_msg check_arch): ${BOLD}${arch}${RESET}" \
        "$(tr_msg check_python): ${BOLD}${python:-?}${RESET}" \
        "$(tr_msg check_java): ${java}" \
        "$(tr_msg check_disk): ${BOLD}${free} MB${RESET}" \
        "$(tr_msg check_fdroid): ${fdroid_line}" \
        "$(tr_msg check_webservers): ${BOLD}${web:-$(tr_msg state_none)}${RESET}" \
        "$(tr_msg check_ports): ${BOLD}${ports:-$(tr_msg state_none)}${RESET}" \
        "$(tr_msg check_repos): ${BOLD}${repos:-$(tr_msg state_none)}${RESET}"
    if [[ -n "$repos" ]]; then
        say_info "$(tr_msg repos_import_hint)"
    fi
}

preflight() {
    case "$(uname -m)" in
        x86_64|aarch64) ;;
        *) say_err "$(tr_msg unsupported_arch): $(uname -m)"; return 1 ;;
    esac
    require_downloader || return 1
    if (( $(free_mb /opt) < MIN_FREE_MB )); then
        say_err "$(tr_msg not_enough_space)"
        return 1
    fi
    if ! local_release && ! network_ok; then
        say_err "$(tr_msg network_failed)"
        return 1
    fi
    if ! command -v apt-get >/dev/null 2>&1; then
        local missing
        missing="$(missing_tools)"
        if [[ -n "$missing" ]]; then
            panel "$C_AMBER" "$(tr_msg no_apt_title)" \
                "$(tr_msg no_apt_body)" \
                "$(tr_msg no_apt_missing): ${BOLD}${missing}${RESET}"
            return 1
        fi
    fi
    if command -v python3 >/dev/null 2>&1 && ! python_is_recent; then
        say_err "$(tr_msg python_too_old)"
        return 1
    fi
}

choose_channel() {
    if [[ -n "${FDROID_PANEL_CHANNEL:-}" ]]; then
        echo "$FDROID_PANEL_CHANNEL"
    elif channel_available stable; then
        echo "stable"
    elif channel_available edge; then
        say_warn "$(tr_msg no_stable_release)" >&2
        if confirm_default "$(tr_msg ask_edge)" yes >&2; then
            echo "edge"
        fi
    else
        say_err "$(tr_msg no_release)"
    fi
}

channel_label() {
    if [[ "$1" == "edge" ]]; then tr_msg channel_edge; else tr_msg channel_stable; fi
}

# Asks how the panel is reached. Sets mode, host, public_url, listen, trusted, port and data, the
# locals of do_install (bash functions see the locals of their caller).
ask_configuration() {
    local proxy_ip
    panel "$ACCENT" "$(tr_msg https_title)" \
        "1) $(tr_msg https_proxy)" \
        "2) $(tr_msg https_caddy)" \
        "3) $(tr_msg https_http)"
    mode="$(ask_value "$(tr_msg ask_https)" 1 valid_mode)"

    port=8080
    while port_in_use "$port"; do port=$((port + 1)); done

    case "$mode" in
        1)
            host="$(ask_value "$(tr_msg ask_host)" "$(default_fqdn)" valid_host)"
            public_url="https://${host}"
            if confirm_default "$(tr_msg ask_proxy_local)" yes; then
                listen="127.0.0.1"
                trusted='"127.0.0.1", "::1"'
            else
                proxy_ip="$(ask_value "$(tr_msg ask_proxy_ip)" "" valid_ip)"
                listen="0.0.0.0"
                trusted="\"${proxy_ip}\""
            fi
            port="$(ask_value "$(tr_msg ask_port)" "$port" valid_port)"
            ;;
        2)
            host="$(ask_value "$(tr_msg ask_host)" "$(default_fqdn)" valid_host)"
            public_url="https://${host}"
            listen="127.0.0.1"
            trusted='"127.0.0.1", "::1"'
            say_info "$(tr_msg caddy_dns_hint)"
            if [[ -n "$(busy_web_ports)" ]] && ! systemctl is-active --quiet caddy 2>/dev/null; then
                say_warn "$(tr_msg caddy_ports_busy)"
            fi
            ;;
        3)
            host="$(ask_value "$(tr_msg ask_host)" "$(default_ip)" valid_host)"
            listen="0.0.0.0"
            trusted='"127.0.0.1", "::1"'
            port="$(ask_value "$(tr_msg ask_port)" "$port" valid_port)"
            public_url="http://${host}:$((10#$port))"
            say_warn "$(tr_msg http_warning)"
            ;;
    esac
    port="$((10#$port))"
    if port_in_use "$port"; then
        say_err "$(tr_msg port_in_use)"
        return 1
    fi
    data="$(ask_value "$(tr_msg ask_data_dir)" "$DEFAULT_DATA_DIR" valid_data_dir)"
    data="${data%/}"
}

# A previous installation removed with its data kept: its configuration is used as is.
read_configuration() {
    say_info "$(tr_msg existing_config): ${C_CYAN}${CONFIG_FILE}${RESET}"
    public_url="$(config_string public_url)"
    host="${public_url#*://}"
    host="${host%%[:/]*}"
    listen="$(config_string host)"
    port="$(config_port)"
    data="$(data_dir)"
    case "$(state_value HTTPS_MODE)" in
        caddy) mode=2 ;;
        http) mode=3 ;;
        *) mode=1 ;;
    esac
}

mode_name() {
    case "$1" in
        2) echo caddy ;;
        3) echo http ;;
        *) echo proxy ;;
    esac
}

mode_label() {
    case "$1" in
        2) tr_msg mode_caddy ;;
        3) tr_msg mode_http ;;
        *) tr_msg mode_proxy ;;
    esac
}

do_install() {
    if is_installed; then
        say_warn "$(tr_msg already_installed)"
        return 0
    fi
    show_checks
    preflight || return 1

    local channel mode host port listen trusted data public_url caddy_installed="no"
    channel="$(choose_channel)"
    if [[ "$channel" != "stable" && "$channel" != "edge" ]]; then
        say_info "$(tr_msg cancelled)"
        return 1
    fi
    if [[ -f "$CONFIG_FILE" ]]; then
        read_configuration
    else
        ask_configuration || return 1
    fi

    panel "$C_AMBER" "$(tr_msg summary_title)" \
        "$(tr_msg summary_url): ${BOLD}${public_url}${RESET}" \
        "$(tr_msg summary_mode): ${BOLD}$(mode_label "$mode")${RESET}" \
        "$(tr_msg summary_listen): ${BOLD}${listen}:${port}${RESET}" \
        "$(tr_msg summary_data): ${BOLD}${data}${RESET}" \
        "$(tr_msg summary_channel): ${BOLD}$(channel_label "$channel")${RESET}" \
        "$(tr_msg summary_writes): ${C_CYAN}${INSTALL_DIR} ${CONFIG_DIR} ${SYSTEMD_DIR}/fdroid-panel*${RESET}"
    if ! confirm_yes; then
        say_info "$(tr_msg cancelled)"
        return 0
    fi
    echo

    new_work_dir
    local src="$WORK_DIR/fdroid-panel"
    if command -v apt-get >/dev/null 2>&1; then
        step "$(tr_msg step_packages)" install_packages || { say_err "$(tr_msg install_failed)"; return 1; }
    fi
    if [[ "$mode" == "2" ]] && ! caddy_present; then
        step "$(tr_msg step_caddy)" install_caddy || { say_err "$(tr_msg install_failed)"; return 1; }
        caddy_installed="yes"
    fi
    step "$(tr_msg step_user)" create_service_user "$data" || { say_err "$(tr_msg install_failed)"; return 1; }
    step "$(tr_msg step_dirs)" prepare_directories "$data" || { say_err "$(tr_msg install_failed)"; return 1; }
    step "$(tr_msg step_download)" fetch_release "$channel" "$WORK_DIR" || { say_err "$(tr_msg install_failed)"; return 1; }
    step "$(tr_msg step_release)" install_release "$src" || { say_err "$(tr_msg install_failed)"; return 1; }
    step "$(tr_msg step_fdroid)" install_fdroidserver "$src/fdroidserver-requirements.txt" "$src/pip-requirements.txt" \
        || { say_err "$(tr_msg install_failed)"; return 1; }
    switch_current "$(release_id "$src/RELEASE")"
    install_script_copy
    if [[ ! -f "$CONFIG_FILE" ]]; then
        write_config "$public_url" "$listen" "$port" "$data" "$trusted"
        write_state "$(mode_name "$mode")" "$caddy_installed"
    fi
    step "$(tr_msg step_database)" migrate_database || { say_err "$(tr_msg install_failed)"; return 1; }
    step "$(tr_msg step_units)" write_units "$data" "$port" || { say_err "$(tr_msg install_failed)"; return 1; }
    start_panel || { say_err "$(tr_msg install_failed)"; return 1; }
    write_helper_state

    local caddy_result=0
    if [[ "$mode" == "2" ]]; then
        configure_caddy "$host" "$port" || caddy_result=$?
        if [[ "$caddy_result" -eq 2 ]]; then
            say_warn "$(tr_msg caddy_custom)"
            caddy_block "$host" "$port"
        elif [[ "$caddy_result" -ne 0 ]]; then
            say_err "$(tr_msg step_caddy_config)"
        else
            say_ok "$(tr_msg step_caddy_config)"
        fi
    fi

    if [[ -n "$(panel_cli users)" ]]; then
        panel "$C_GREEN" "$(tr_msg installed_title)" \
            "$(tr_msg open_url): ${BOLD}${public_url}/admin/${RESET}" \
            "$(tr_msg existing_accounts)"
    else
        panel "$C_GREEN" "$(tr_msg installed_title)" \
            "$(tr_msg open_url): ${BOLD}${public_url}/admin/${RESET}" \
            "$(tr_msg setup_code):" \
            "    ${BOLD}${ACCENT}$(new_setup_code)${RESET}"
    fi
    if [[ "$mode" == "1" ]]; then
        say_info "$(tr_msg proxy_todo)"
    fi
}

# ------------------------------------------------------------
# Update, with automatic rollback
# ------------------------------------------------------------

backup_database() {
    local dest="$1" data file
    data="$(data_dir)"
    install -d -m 0700 -o "$SERVICE_USER" -g "$SERVICE_USER" "$(dirname "$dest")"
    install -d -m 0700 -o "$SERVICE_USER" -g "$SERVICE_USER" "$dest"
    for file in panel.db panel.db-wal panel.db-shm; do
        if [[ -f "$data/$file" ]]; then
            cp -p "$data/$file" "$dest/$file" || return 1
        fi
    done
    # Older backups are removed, the most recent ones are kept.
    find "$(dirname "$dest")" -mindepth 1 -maxdepth 1 -type d | sort | head -n "-${DATABASE_BACKUPS_KEPT}" \
        | while read -r old; do rm -rf "$old"; done
}

restore_database() {
    local src="$1" data file
    data="$(data_dir)"
    for file in panel.db panel.db-wal panel.db-shm; do
        rm -f "$data/$file"
        if [[ -f "$src/$file" ]]; then
            cp -p "$src/$file" "$data/$file" || return 1
        fi
    done
}

remove_old_releases() {
    local keep_current keep_previous="$1" dir
    keep_current="$(current_release_id)"
    for dir in "$RELEASES_DIR"/*; do
        [[ -d "$dir" ]] || continue
        case "$(basename "$dir")" in
            "$keep_current"|"$keep_previous") ;;
            *) rm -rf "$dir" ;;
        esac
    done
}

# Sets MAINTENANCE_CODE for the browser: up_to_date, download_failed, install_failed, rolled_back,
# rollback_failed. Returns 0 when the panel runs the latest release.
update_panel() {
    local interactive="$1" channel previous new_id src backup previous_fdroid
    MAINTENANCE_CODE=""
    require_installed || { MAINTENANCE_CODE="not_installed"; return 1; }
    channel="$(release_field "${CURRENT_LINK}/RELEASE" channel)"
    previous="$(current_release_id)"

    new_work_dir
    if ! step "$(tr_msg step_download)" fetch_release "$channel" "$WORK_DIR"; then
        MAINTENANCE_CODE="download_failed"
        return 1
    fi
    src="$WORK_DIR/fdroid-panel"
    new_id="$(release_id "$src/RELEASE")"
    if [[ "$new_id" == "$previous" ]]; then
        say_ok "$(tr_msg up_to_date)"
        MAINTENANCE_CODE="up_to_date"
        return 0
    fi

    if [[ "$interactive" == "yes" ]]; then
        panel "$C_AMBER" "$(tr_msg update_title)" \
            "$(tr_msg update_from_to): ${BOLD}$(release_label "${CURRENT_LINK}/RELEASE")${RESET} → ${BOLD}$(release_label "$src/RELEASE")${RESET}" \
            "$(tr_msg update_body)"
        if ! confirm_yes; then
            say_info "$(tr_msg cancelled)"
            MAINTENANCE_CODE="cancelled"
            return 0
        fi
        echo
    fi

    if command -v apt-get >/dev/null 2>&1; then
        step "$(tr_msg step_packages)" install_packages || { MAINTENANCE_CODE="install_failed"; return 1; }
    fi
    step "$(tr_msg step_release)" install_release "$src" || { MAINTENANCE_CODE="install_failed"; return 1; }
    previous_fdroid="$(readlink "$FDROID_LINK" 2>/dev/null || true)"
    step "$(tr_msg step_fdroid)" install_fdroidserver "$src/fdroidserver-requirements.txt" "$src/pip-requirements.txt" \
        || { rm -rf "${RELEASES_DIR:?}/${new_id}"; MAINTENANCE_CODE="install_failed"; return 1; }

    backup="$(data_dir)/backups/panel-database/$(date +%Y%m%d-%H%M%S)"
    step "$(tr_msg step_stop)" systemctl stop "$PANEL_UNIT" || true
    if ! step "$(tr_msg step_db_backup)" backup_database "$backup"; then
        systemctl start "$PANEL_UNIT" || true
        MAINTENANCE_CODE="install_failed"
        return 1
    fi

    switch_current "$new_id"
    if step "$(tr_msg step_database)" migrate_database && start_panel; then
        install_script_copy
        remove_old_releases "$previous"
        remove_unused_fdroidserver
        write_helper_state
        say_ok "$(tr_msg updated): $(release_label "${CURRENT_LINK}/RELEASE")"
        MAINTENANCE_CODE=""
        return 0
    fi

    say_warn "$(tr_msg step_rollback)"
    systemctl stop "$PANEL_UNIT" || true
    switch_current "$previous"
    if [[ -n "$previous_fdroid" ]]; then
        point_fdroid_link "$previous_fdroid"
    fi
    if restore_database "$backup" && start_panel; then
        say_err "$(tr_msg update_rolled_back)"
        MAINTENANCE_CODE="rolled_back"
    else
        say_err "$(tr_msg rollback_failed) ${backup}"
        MAINTENANCE_CODE="rollback_failed"
    fi
    write_helper_state
    return 1
}

do_update() {
    update_panel yes || true
}

# ------------------------------------------------------------
# Status
# ------------------------------------------------------------

repository_count() {
    local database
    database="$(data_dir)/panel.db"
    [[ -f "$database" ]] || { echo 0; return 0; }
    python3 -I -c '
import sqlite3, sys
connection = sqlite3.connect("file:" + sys.argv[1] + "?mode=ro", uri=True)
print(connection.execute("select count(*) from repositories").fetchone()[0])
' "$database" 2>/dev/null || echo "?"
}

service_state() {
    local unit="$1"
    case "$(systemctl is-active "$unit" 2>/dev/null)" in
        active) echo "${C_GREEN}$(tr_msg status_active)${RESET}" ;;
        failed) echo "${C_RED}$(tr_msg status_broken)${RESET}" ;;
        *) echo "${C_GREY}$(tr_msg status_inactive)${RESET}" ;;
    esac
}

show_status() {
    require_installed || return 1
    local lines=()
    lines+=("$(tr_msg status_service): $(service_state "$PANEL_UNIT")")
    lines+=("$(tr_msg status_version): ${BOLD}$(release_label "${CURRENT_LINK}/RELEASE")${RESET}")
    lines+=("$(tr_msg status_url): ${BOLD}$(config_string public_url)/admin/${RESET}")
    lines+=("$(tr_msg status_listen): ${BOLD}$(config_string host):$(config_port)${RESET}")
    lines+=("$(tr_msg status_repos): ${BOLD}$(repository_count)${RESET}")
    lines+=("$(tr_msg status_fdroid): ${BOLD}$(fdroid_version)${RESET} ${C_CYAN}${FDROID_LINK}${RESET}")
    lines+=("$(tr_msg status_helper): $(service_state "$HELPER_PATH_UNIT")")
    lines+=("$(tr_msg status_disk): ${BOLD}$(du -sh "$(data_dir)" 2>/dev/null | cut -f1)${RESET} ${C_CYAN}$(data_dir)${RESET}")
    if [[ "$(state_value HTTPS_MODE)" == "caddy" ]]; then
        lines+=("$(tr_msg status_caddy): $(service_state caddy)")
    fi
    panel "$ACCENT" "$(tr_msg status_title)" "${lines[@]}"
}

# ------------------------------------------------------------
# Repair
# ------------------------------------------------------------

fix_permissions() {
    local data="$1"
    prepare_directories "$data" || return 1
    chown -R "$SERVICE_USER:$SERVICE_USER" "$SECRETS_DIR" || return 1
    find "$data" -xdev -path "$data/maintenance" -prune -o -exec chown -h "$SERVICE_USER:$SERVICE_USER" {} + || return 1
    chown root:"$SERVICE_USER" "$CONFIG_FILE" && chmod 0640 "$CONFIG_FILE"
}

panel_venv_works() {
    "${CURRENT_LINK}/venv/bin/python" -c 'import fdroid_panel' >/dev/null 2>&1
}

do_repair() {
    require_installed || return 1
    local data release_dir
    data="$(data_dir)"
    release_dir="$(readlink -f "$CURRENT_LINK")"
    if command -v apt-get >/dev/null 2>&1; then
        step "$(tr_msg step_packages)" install_packages || return 1
    fi
    step "$(tr_msg step_user)" create_service_user "$data" || return 1
    step "$(tr_msg step_permissions)" fix_permissions "$data" || return 1
    if ! panel_venv_works; then
        step "$(tr_msg step_venv)" build_release_venv "$release_dir" || return 1
    fi
    if ! fdroid_works "$FDROID_LINK"; then
        step "$(tr_msg step_fdroid)" install_fdroidserver "$release_dir/fdroidserver-requirements.txt" \
            "$release_dir/pip-requirements.txt" yes || return 1
        remove_unused_fdroidserver
    fi
    install_script_copy
    step "$(tr_msg step_database)" migrate_database || return 1
    step "$(tr_msg step_units)" write_units "$data" "$(config_port)" || return 1
    start_panel || return 1
    write_helper_state
    say_ok "$(tr_msg repaired)"
}

# ------------------------------------------------------------
# Accounts
# ------------------------------------------------------------

do_reset() {
    require_installed || return 1
    local users username password flags=()
    users="$(panel_cli users)" || return 1
    if [[ -z "$users" ]]; then
        say_info "$(tr_msg no_accounts)"
        panel "$C_GREEN" "$(tr_msg setup_code)" "    ${BOLD}${ACCENT}$(new_setup_code)${RESET}"
        return 0
    fi
    local lines=()
    while IFS= read -r line; do lines+=("$line"); done <<<"$users"
    panel "$ACCENT" "$(tr_msg reset_title)" "${lines[@]}"
    username="$(prompt_free "$(tr_msg ask_username)")"
    if [[ ! "$username" =~ ^[a-z0-9._-]+$ ]] || ! grep -q "^${username} " <<<"$users"; then
        say_err "$(tr_msg unknown_username)"
        return 1
    fi
    if confirm_default "$(tr_msg ask_disable_2fa)" no; then
        flags+=(--disable-second-factor)
    fi
    if ! confirm_yes; then
        say_info "$(tr_msg cancelled)"
        return 0
    fi
    password="$(panel_cli reset-password "${flags[@]}" "$username")" || return 1
    panel "$C_GREEN" "$(tr_msg new_password)" "    ${BOLD}${ACCENT}${password}${RESET}"
    say_info "$(tr_msg sessions_ended)"
}

# ------------------------------------------------------------
# Reverse proxy snippet
# ------------------------------------------------------------

do_proxy() {
    require_installed || return 1
    local public_url host port upstream
    public_url="$(config_string public_url)"
    host="${public_url#*://}"
    host="${host%%[:/]*}"
    port="$(config_port)"
    upstream="$(config_string host)"
    if [[ "$upstream" == "0.0.0.0" ]]; then
        upstream="$(default_ip)"
    fi

    panel "$ACCENT" "$(tr_msg proxy_title)" "$(tr_msg proxy_intro)" \
        "$(tr_msg proxy_trusted): ${BOLD}$(config_trusted)${RESET}"
    echo
    printf "%bnginx%b\n" "$BOLD" "$RESET"
    cat <<EOF
server {
    listen 443 ssl;
    server_name ${host};
    # ssl_certificate and ssl_certificate_key of ${host}

    # Large APK files are sent in parts of a few megabytes.
    client_max_body_size 64m;

    location / {
        proxy_pass http://${upstream}:${port};
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # Live logs of publications are streamed.
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
EOF
    echo
    printf "%bCaddy%b\n" "$BOLD" "$RESET"
    cat <<EOF
${host} {
    reverse_proxy ${upstream}:${port}
}
EOF
    echo
    printf "%b%s%b\n" "$BOLD" "$(tr_msg proxy_npm)" "$RESET"
    cat <<EOF
client_max_body_size 64m;
proxy_buffering off;
proxy_read_timeout 1h;
EOF
}

# ------------------------------------------------------------
# Uninstall
# ------------------------------------------------------------

remove_units() {
    systemctl disable --now "$HELPER_PATH_UNIT" "$PANEL_UNIT" >/dev/null 2>&1 || true
    rm -f "${SYSTEMD_DIR}/${PANEL_UNIT}" "${SYSTEMD_DIR}/${HELPER_UNIT}" "${SYSTEMD_DIR}/${HELPER_PATH_UNIT}"
    rm -rf "${SYSTEMD_DIR}/${PANEL_UNIT}.d"
    systemctl daemon-reload
}

restore_caddy() {
    if grep -qF "$MANAGED_MARKER" "$CADDYFILE" 2>/dev/null; then
        if [[ -f "${CONFIG_DIR}/Caddyfile.original" ]]; then
            cp -p "${CONFIG_DIR}/Caddyfile.original" "$CADDYFILE"
        else
            rm -f "$CADDYFILE"
        fi
        systemctl reload-or-restart caddy >/dev/null 2>&1 || true
    fi
}

do_uninstall() {
    require_installed || return 1
    local choice data
    data="$(data_dir)"
    panel "$C_AMBER" "$(tr_msg uninstall_title)" \
        "1) $(tr_msg uninstall_keep)" \
        "2) $(tr_msg uninstall_all)" \
        "3) $(tr_msg uninstall_cancel)"
    read -r -p "$(tr_msg choose_option) [1-3]: " choice || choice=3
    case "$choice" in
        1) uninstall_keep_data ;;
        2) uninstall_everything "$data" ;;
        *) say_info "$(tr_msg cancelled)" ;;
    esac
}

uninstall_keep_data() {
    if ! confirm_yes; then
        say_info "$(tr_msg cancelled)"
        return 0
    fi
    echo
    step "$(tr_msg step_remove)" remove_application || return 1
    restore_caddy
    say_ok "$(tr_msg uninstalled)"
    panel "$C_BLUE" "$(tr_msg kept_paths)" "${C_CYAN}$(data_dir)${RESET}" "${C_CYAN}${CONFIG_DIR}${RESET}"
    say_info "$(tr_msg reinstall_hint)"
}

remove_application() {
    remove_units
    rm -rf "${INSTALL_DIR:?}"
}

uninstall_everything() {
    local data="$1" repositories path answer kept=()
    panel "$C_RED" "$(tr_msg uninstall_title)" "$(tr_msg uninstall_all_warning)"
    if ! confirm_yes; then
        say_info "$(tr_msg cancelled)"
        return 0
    fi
    echo
    systemctl stop "$PANEL_UNIT" >/dev/null 2>&1 || true
    repositories="$(panel_cli detach-repositories)" || return 1
    say_ok "$(tr_msg passwords_restored)"

    # The list comes on descriptor 3: the questions inside the loop read the answers on stdin.
    while IFS= read -r path <&3; do
        [[ -n "$path" ]] || continue
        if [[ "$path" == "$data"/* ]]; then
            answer="$(prompt_free "$(tr_msg ask_delete_repo) ${C_CYAN}${path}${RESET}")"
            if [[ "$answer" == "$path" ]]; then
                rm -rf -- "$path"
                say_ok "$(tr_msg repo_deleted): ${path}"
                continue
            fi
        fi
        kept+=("$path")
        say_info "$(tr_msg repo_kept): ${path}"
    done 3<<<"$repositories"

    step "$(tr_msg step_remove)" remove_application || return 1
    restore_caddy
    if [[ "$(state_value CADDY_INSTALLED_BY_PANEL)" == "yes" ]]; then
        DEBIAN_FRONTEND=noninteractive apt-get purge -y -q caddy >/dev/null 2>&1 || true
        rm -f /etc/apt/sources.list.d/caddy-stable.list /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    fi
    remove_data_keeping "$data" "${kept[@]}"
    for path in "${kept[@]}"; do
        chown -R root:root -- "$path"
    done
    rm -rf "${CONFIG_DIR:?}"
    userdel "$SERVICE_USER" >/dev/null 2>&1 || true
    say_ok "$(tr_msg uninstalled)"
    if ((${#kept[@]})); then
        say_info "$(tr_msg repos_now_root)"
        panel "$C_BLUE" "$(tr_msg kept_paths)" "${kept[@]}"
    fi
}

# Deletes the data directory except the kept repositories inside it (and the directories leading
# to them).
remove_data_keeping() {
    local dir="$1" entry path keep exact
    shift
    [[ -d "$dir" ]] || return 0
    while IFS= read -r -d '' entry; do
        keep="no"
        exact="no"
        for path in "$@"; do
            if [[ "$path" == "$entry" ]]; then
                exact="yes"
            fi
            if [[ "$path" == "$entry" || "$path" == "$entry"/* ]]; then
                keep="yes"
            fi
        done
        if [[ "$keep" == "no" ]]; then
            rm -rf -- "$entry"
        elif [[ "$exact" == "no" ]]; then
            remove_data_keeping "$entry" "$@"
        fi
    done < <(find "$dir" -mindepth 1 -maxdepth 1 -print0)
    rmdir "$dir" 2>/dev/null || true
}

# ------------------------------------------------------------
# Maintenance helper (root, started by a systemd path unit)
# ------------------------------------------------------------

MAINTENANCE_CODE=""

write_result() {
    local file="$1" state="$2" code="$3"
    cat > "${file}.new" <<EOF
{"state": $(json_string "$state"), "code": $( [[ -n "$code" ]] && json_string "$code" || echo null )}
EOF
    chown root:"$SERVICE_USER" "${file}.new"
    chmod 0640 "${file}.new"
    mv -f "${file}.new" "$file"
}

# Prints the action and the path of a request file, one per line, or fails when it is malformed.
read_request() {
    python3 -I - "$1" <<'PY'
import json
import sys

ACTIONS = {"check", "update", "update-fdroidserver", "grant"}
with open(sys.argv[1], "rb") as handle:
    data = handle.read(4097)
if len(data) > 4096:
    sys.exit(1)
request = json.loads(data)
action, path = request.get("action"), request.get("path", "")
if action not in ACTIONS or not isinstance(path, str) or any(c in path for c in "\n\r\0"):
    sys.exit(1)
print(action)
print(path)
PY
}

check_for_update() {
    local channel dest
    channel="$(release_field "${CURRENT_LINK}/RELEASE" channel)"
    new_work_dir
    if ! fetch_release "$channel" "$WORK_DIR"; then
        MAINTENANCE_CODE="download_failed"
        return 1
    fi
    dest="$(maintenance_dir)/latest.json"
    local release="$WORK_DIR/fdroid-panel/RELEASE"
    cat > "${dest}.new" <<EOF
{"checkedAt": $(json_string "$(date -u +%Y-%m-%dT%H:%M:%SZ)"), "channel": $(json_string "$channel"), "version": $(json_string "$(release_field "$release" version)"), "commit": $(json_string "$(release_field "$release" commit)")}
EOF
    chown root:"$SERVICE_USER" "${dest}.new"
    chmod 0640 "${dest}.new"
    mv -f "${dest}.new" "$dest"
    echo "Latest: $(release_label "$release")"
}

update_fdroidserver() {
    local release_dir
    release_dir="$(readlink -f "$CURRENT_LINK")"
    if ! install_fdroidserver "$release_dir/fdroidserver-requirements.txt" "$release_dir/pip-requirements.txt" yes; then
        MAINTENANCE_CODE="install_failed"
        return 1
    fi
    remove_unused_fdroidserver
    write_helper_state
    echo "fdroidserver: $(fdroid_version)"
}

# Gives the panel user write access to an existing repository the admin chose to import.
grant_access() {
    local path="$1" resolved
    resolved="$(realpath -e -- "$path" 2>/dev/null || true)"
    if [[ "$path" != /* || -z "$resolved" || "$resolved" != "${path%/}" ]]; then
        MAINTENANCE_CODE="path_not_found"
        return 1
    fi
    case "$resolved" in
        /|/bin*|/boot*|/dev*|/etc*|/lib*|/proc*|/root|/run*|/sbin*|/sys*|/usr*|/var|/var/lib|/home|/opt|/srv|/tmp|"$INSTALL_DIR"*)
            MAINTENANCE_CODE="path_not_allowed"
            return 1
            ;;
    esac
    if [[ ! -f "$resolved/config.yml" || ! -d "$resolved/repo" ]]; then
        MAINTENANCE_CODE="not_a_repository"
        return 1
    fi
    # A hard link could point to a file outside the repository; such repositories are refused.
    if [[ -n "$(find "$resolved" -xdev -type f -links +1 -print -quit)" ]]; then
        MAINTENANCE_CODE="path_not_allowed"
        return 1
    fi
    find "$resolved" -xdev -exec chown -h "$SERVICE_USER:$SERVICE_USER" {} + || { MAINTENANCE_CODE="failed"; return 1; }
    chmod 0600 "$resolved/config.yml"
    find "$resolved" -maxdepth 1 -type f -name 'keystore*' -exec chmod 0600 {} +
    echo "Access granted: $resolved"
}

handle_request() {
    local request="$1" dir id action path result log rc=0 lines
    dir="$(maintenance_dir)"
    id="$(basename "$request" .json)"
    if [[ ! "$id" =~ ^[0-9a-f]{32}$ || -L "$request" || ! -f "$request" ]]; then
        rm -f -- "$request"
        return 0
    fi
    lines="$(read_request "$request" 2>/dev/null)" || { rm -f -- "$request"; return 0; }
    rm -f -- "$request"
    action="$(sed -n 1p <<<"$lines")"
    path="$(sed -n 2p <<<"$lines")"
    result="$dir/results/$id.json"
    log="$dir/results/$id.log"
    install -m 0640 -o root -g "$SERVICE_USER" /dev/null "$log"
    write_result "$result" running ""

    MAINTENANCE_CODE=""
    case "$action" in
        check) check_for_update >>"$log" 2>&1 || rc=$? ;;
        update) update_panel no >>"$log" 2>&1 || rc=$? ;;
        update-fdroidserver) update_fdroidserver >>"$log" 2>&1 || rc=$? ;;
        grant) grant_access "$path" >>"$log" 2>&1 || rc=$? ;;
    esac
    if [[ "$rc" -eq 0 ]]; then
        write_result "$result" succeeded "$MAINTENANCE_CODE"
    else
        write_result "$result" failed "${MAINTENANCE_CODE:-failed}"
    fi
}

run_maintenance() {
    require_root
    is_installed || exit 0
    local dir request
    dir="$(maintenance_dir)"
    shopt -s nullglob
    for request in "$dir"/requests/*.json; do
        handle_request "$request"
    done
    # Results of the last week are enough for the browser.
    find "$dir/results" -type f -mtime +7 -delete 2>/dev/null || true
}

# ------------------------------------------------------------
# Menu
# ------------------------------------------------------------

# Menu entries report their own errors on screen; a failed action must bring
# the user back to the menu instead of ending the session through set -e.
menu_action() {
    "$@" || true
}

main_menu() {
    local choice
    while true; do
        show_banner
        printf " %b1)%b %s\n" "${ACCENT_SOFT}" "${RESET}" "$(tr_msg menu_install)"
        printf " %b2)%b %s\n" "${ACCENT_SOFT}" "${RESET}" "$(tr_msg menu_update)"
        printf " %b3)%b %s\n" "${ACCENT_SOFT}" "${RESET}" "$(tr_msg menu_status)"
        printf " %b4)%b %s\n" "${ACCENT_SOFT}" "${RESET}" "$(tr_msg menu_repair)"
        printf " %b5)%b %s\n" "${ACCENT_SOFT}" "${RESET}" "$(tr_msg menu_reset)"
        printf " %b6)%b %s\n" "${ACCENT_SOFT}" "${RESET}" "$(tr_msg menu_proxy)"
        printf " %b7)%b %s\n" "${ACCENT_SOFT}" "${RESET}" "$(tr_msg menu_uninstall)"
        printf " %b8)%b %s\n" "${ACCENT_SOFT}" "${RESET}" "$(tr_msg menu_quit)"
        echo

        read -r -p "$(tr_msg choose_option) [1-8]: " choice || exit 0
        echo

        case "$choice" in
            1) menu_action do_install; pause ;;
            2) menu_action do_update; pause ;;
            3) menu_action show_status; pause ;;
            4) menu_action do_repair; pause ;;
            5) menu_action do_reset; pause ;;
            6) menu_action do_proxy; pause ;;
            7) menu_action do_uninstall; pause ;;
            8)
                say_info "$(tr_msg bye)"
                exit 0
                ;;
            *)
                say_err "$(tr_msg invalid_choice)"
                pause
                ;;
        esac
    done
}

case "${1:-}" in
    --maintenance)
        run_maintenance
        exit 0
        ;;
    "") ;;
    *)
        say_err "$(tr_msg usage)"
        exit 2
        ;;
esac

require_root
require_systemd
main_menu
