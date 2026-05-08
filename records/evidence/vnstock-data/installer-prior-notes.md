# vnstock_data Installer Prior Notes

## Evidence Summary

Historical notes from the old project asserted three installer/runtime facts that need local proof before use:

1. The member installer command file was available at `https://vnstocks.com/files/vnstock-cli-installer.run`.
2. The installer resembled a Makeself archive and exposed option names including `--non-interactive`, `--api-key`, `--venv-path`, and `--language`.
3. Subscriber runtime import behavior used local config at `/home/datguy/.vnstock/user.json` in the prior environment.

These are candidate facts only. Installed runtime behavior observed in this standalone lab wins over historical notes.
