//! Launches the product CLI by running the packaged Electron binary as Node.
//!
//! Why a native binary rather than the `.cmd` alone: `cmd.exe` reparses `%*` and
//! executes or truncates embedded newlines, so orchestration message bodies
//! cannot survive it (#8374). The `.cmd` shim refuses those subcommands and
//! defers here.
//!
//! Why not a managed assembly: a small freshly-compiled MSIL image in a
//! user-writable directory that mutates environment variables and proxies a
//! child process is the shape antivirus MSIL heuristics are trained on, and it
//! was flagged as exactly that across several vendors (#23383).
//!
//! On a Windows server host, orcad copies this binary into its profile and
//! writes `orca-launcher.cfg` beside it; that file selects the server mode.
//!
//! Nothing here names the product: the app executable comes from the
//! `app-executable-name` stamp packaging writes into resources, and the command
//! name agents are told to run is this launcher's own file stem.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{exit, Command};

const SERVER_CONFIG_FILENAME: &str = "orca-launcher.cfg";
const APP_EXECUTABLE_STAMP_FILENAME: &str = "app-executable-name";

#[cfg(windows)]
mod administrator_status;

fn main() {
    #[cfg(windows)]
    administrator_status::run_if_requested();
    let launcher = match env::current_exe() {
        Ok(path) => path,
        Err(error) => fail(&format!("Unable to start the CLI: {error}")),
    };
    if let Some(config) = launcher
        .parent()
        .map(|directory| directory.join(SERVER_CONFIG_FILENAME))
        .filter(|config| config.is_file())
    {
        run_server_cli(&config);
    }

    let Some(resources_directory) = launcher.parent().and_then(Path::parent) else {
        fail(&format!(
            "Unable to locate the app executable next to \"{}\"",
            launcher.display()
        ))
    };
    let Some(app_directory) = resources_directory.parent() else {
        fail(&format!(
            "Unable to locate the app executable next to \"{}\"",
            resources_directory.display()
        ))
    };

    let electron_path = app_directory.join(app_executable_file_name(resources_directory));
    if !electron_path.is_file() {
        fail(&format!(
            "Unable to locate \"{}\" next to \"{}\"",
            electron_path.display(),
            resources_directory.display()
        ));
    }

    let cli_path: PathBuf = resources_directory
        .join("app.asar.unpacked")
        .join("out")
        .join("cli")
        .join("index.js");
    if !cli_path.is_file() {
        fail(&format!(
            "Unable to locate the CLI entrypoint at \"{}\"",
            cli_path.display()
        ));
    }

    // Why mutate this process rather than hand the child an environment map:
    // an explicit map collapses a block carrying both PATH and Path into one
    // entry, which is what killed the CLI in #12046. Leaving the map untouched
    // makes the child inherit our block verbatim.
    move_environment_variable("NODE_OPTIONS", "ORCA_NODE_OPTIONS");
    move_environment_variable(
        "NODE_REPL_EXTERNAL_MODULE",
        "ORCA_NODE_REPL_EXTERNAL_MODULE",
    );
    env::set_var("ELECTRON_RUN_AS_NODE", "1");
    env::set_var("ORCA_WINDOWS_PACKAGED_CLI_LAUNCHER", "1");
    let command_name = launcher
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or_default()
        .to_owned();
    // Why: a WSL caller may ask for the Linux-only `<name>-ide` alias; anything else is this launcher.
    let linux_command_name = format!("{command_name}-ide");
    let requested_command = env::var("ORCA_CLI_COMMAND").unwrap_or_default();
    env::set_var(
        "ORCA_CLI_COMMAND",
        if requested_command == linux_command_name {
            &linux_command_name
        } else {
            &command_name
        },
    );

    run_cli(&electron_path, &cli_path)
}

/// The server mode: the pinned Node runs the active slot's CLI under the
/// server's profile, as the POSIX launcher does.
fn run_server_cli(config_path: &Path) -> ! {
    let config = fs::read_to_string(config_path).unwrap_or_else(|error| {
        fail(&format!(
            "Unable to read the CLI configuration at \"{}\": {error}",
            config_path.display()
        ))
    });
    let node_path = PathBuf::from(config_value(&config, "node", config_path));
    let cli_path = PathBuf::from(config_value(&config, "cli", config_path));
    let user_data_path = config_value(&config, "user-data", config_path);
    for path in [&node_path, &cli_path] {
        if !path.is_file() {
            fail(&format!(
                "Unable to locate \"{}\"; reconnect to the server to refresh the CLI",
                path.display()
            ));
        }
    }
    env::set_var("ORCA_USER_DATA_PATH", user_data_path);
    for name in [
        "NODE_OPTIONS",
        "NODE_REPL_EXTERNAL_MODULE",
        "ELECTRON_RUN_AS_NODE",
        // A server started by the desktop's `serve` inherits this marker, which would make
        // orchestration demand a bare launcher-name resume command.
        "ORCA_WINDOWS_PACKAGED_CLI_LAUNCHER",
    ] {
        env::remove_var(name);
    }
    run_cli(&node_path, &cli_path)
}

fn config_value<'a>(config: &'a str, key: &str, config_path: &Path) -> &'a str {
    config
        .lines()
        .find_map(|line| {
            line.split_once('=')
                .filter(|(name, value)| *name == key && !value.is_empty())
                .map(|(_, value)| value)
        })
        .unwrap_or_else(|| {
            fail(&format!(
                "The CLI configuration at \"{}\" has no {key}",
                config_path.display()
            ))
        })
}

fn run_cli(program: &Path, cli_path: &Path) -> ! {
    // Each argument stays its own argv entry, so a body holding newlines reaches
    // the CLI intact.
    let mut command = Command::new(program);
    command.arg(cli_path).args(env::args_os().skip(1));

    match command.status() {
        Ok(status) => exit(status.code().unwrap_or(1)),
        Err(error) => fail(&format!("Unable to start the CLI: {error}")),
    }
}

/// The Electron executable's file name, read from the stamp packaging writes into resources.
fn app_executable_file_name(resources_directory: &Path) -> String {
    let stamp_path = resources_directory.join(APP_EXECUTABLE_STAMP_FILENAME);
    let name = fs::read_to_string(&stamp_path)
        .ok()
        .and_then(|content| content.lines().next().map(|line| line.trim().to_owned()))
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| {
            fail(&format!(
                "Unable to read the app executable name from \"{}\"",
                stamp_path.display()
            ))
        });
    if name.to_ascii_lowercase().ends_with(".exe") {
        name
    } else {
        format!("{name}.exe")
    }
}

fn move_environment_variable(source_name: &str, target_name: &str) {
    match env::var_os(source_name) {
        // A missing source clears the target, so a stale value cannot leak in.
        None => env::remove_var(target_name),
        Some(value) => {
            env::remove_var(source_name);
            env::set_var(target_name, value);
        }
    }
}

fn fail(message: &str) -> ! {
    eprintln!("{message}");
    exit(1)
}
