/**
 * The W&B mirror sidecar, a Python program kept as a string: orcad ships the harness as one
 * bundled .mjs file, so a separate .py beside it would not reach the GPU server.
 *
 * Usage: python wandb_mirror.py --metrics FILE --project P --group G --name RUN --id ID
 *        [--entity E] [--config FILE] [--meta JSON] [--dir DIR] [--tags a,b]
 * stdin carries control lines; `{"type":"end","state":..,"exitCode":..}` or EOF ends the run.
 * stdout carries one JSON status line per event: started, warning, error, finished.
 */
export const WANDB_MIRROR_SCRIPT = String.raw`
import argparse
import json
import math
import os
import sys
import threading

POLL_SECONDS = 1.0
READ_CHUNK_BYTES = 4 * 1024 * 1024
FINISH_TIMEOUT_SECONDS = 600
STEP_KEY = "aster/step"
ROWS_KEY = "aster/rows"
# Inherited values that would attach the mirror to someone else's run or sweep.
FOREIGN_ENV = ("WANDB_RUN_ID", "WANDB_NAME", "WANDB_RESUME", "WANDB_SWEEP_ID",
               "WANDB_RUN_GROUP", "WANDB_TAGS", "WANDB_NOTES", "WANDB_JOB_TYPE")


def emit(kind, **fields):
    fields["type"] = kind
    try:
        sys.stdout.write(json.dumps(fields) + "\n")
        sys.stdout.flush()
    except Exception:
        pass


def short(error):
    text = str(error).strip().splitlines()
    return (type(error).__name__ + ": " + (text[-1] if text else ""))[:300]


def finite_number(value):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value))


def row_payload(row):
    """One metrics.jsonl row as a wandb.log payload, or None when it holds no finite number."""
    if not isinstance(row, dict) or not isinstance(row.get("metrics"), dict):
        return None
    split = row.get("split")
    prefix = split.strip() + "/" if isinstance(split, str) and split.strip() else ""
    payload = {}
    for name, value in row["metrics"].items():
        if finite_number(value):
            payload[prefix + str(name)] = value
    if not payload:
        return None
    if finite_number(row.get("step")):
        payload[STEP_KEY] = row["step"]
    return payload


class RowReader:
    """Complete lines appended to metrics.jsonl since the last read, numbered like the harness."""

    def __init__(self, path):
        self.path = path
        self.offset = 0
        self.pending = b""
        self.rows = 0

    def read(self, final=False):
        chunks = []
        try:
            with open(self.path, "rb") as handle:
                handle.seek(self.offset)
                while True:
                    chunk = handle.read(READ_CHUNK_BYTES)
                    if not chunk:
                        break
                    chunks.append(chunk)
                    self.offset += len(chunk)
        except OSError:
            return []
        lines = (self.pending + b"".join(chunks)).split(b"\n")
        self.pending = lines.pop()
        if final and self.pending:
            lines.append(self.pending)
            self.pending = b""
        rows = []
        for line in lines:
            if not line.strip():
                continue
            self.rows += 1
            try:
                rows.append((self.rows, json.loads(line.decode("utf-8"))))
            except ValueError:
                rows.append((self.rows, None))
        return rows


def watch_control(stream, ended, outcome):
    try:
        for line in stream:
            try:
                message = json.loads(line)
            except ValueError:
                continue
            if isinstance(message, dict) and message.get("type") == "end":
                outcome.update(message)
                break
    except Exception:
        pass
    ended.set()


def exit_code_for(outcome):
    """W&B marks a run failed by a non-zero code: only a known failure, or a harness that vanished."""
    if outcome and outcome.get("state") not in ("failed", "cancelled"):
        return 0
    code = outcome.get("exitCode")
    return code if isinstance(code, int) and not isinstance(code, bool) and code != 0 else 1


def load_config(args):
    config = {}
    if args.config:
        try:
            with open(args.config, "r", encoding="utf-8") as handle:
                loaded = json.load(handle)
            if isinstance(loaded, dict):
                config.update(loaded)
        except Exception as error:
            emit("warning", message="config.json was not sent: " + short(error))
    if args.meta:
        try:
            config.setdefault("aster", json.loads(args.meta))
        except ValueError:
            pass
    return config


def make_settings(wandb):
    for options in ({"console": "off", "silent": True, "save_code": False}, {"console": "off"}):
        try:
            return wandb.Settings(**options)
        except Exception:
            continue
    return None


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Mirror an Aster Run's metrics to W&B")
    parser.add_argument("--metrics", required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--group", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--id", required=True)
    parser.add_argument("--entity")
    parser.add_argument("--config")
    parser.add_argument("--meta")
    parser.add_argument("--dir")
    parser.add_argument("--tags", default="aster")
    return parser.parse_args(argv)


def main(argv):
    args = parse_args(argv)
    control = sys.stdin
    # Why: nothing may ever prompt on the control pipe, e.g. a wandb login question.
    sys.stdin = open(os.devnull, "r")
    for name in FOREIGN_ENV:
        os.environ.pop(name, None)
    ended = threading.Event()
    outcome = {}
    threading.Thread(target=watch_control, args=(control, ended, outcome), daemon=True).start()
    try:
        import wandb
    except Exception as error:
        emit("error", message="this Python cannot import wandb (" + short(error) + ")")
        return 2
    directory = args.dir or os.environ.get("WANDB_DIR") or os.path.join(
        os.path.expanduser("~"), ".cache", "aster", "wandb")
    try:
        os.makedirs(directory, exist_ok=True)
        run = wandb.init(project=args.project, entity=args.entity or None, group=args.group,
                         name=args.name, id=args.id, resume="allow", job_type="aster-run",
                         tags=[tag for tag in args.tags.split(",") if tag],
                         config=load_config(args), dir=directory, settings=make_settings(wandb))
    except Exception as error:
        emit("error", message="wandb.init failed: " + short(error))
        return 3
    if run is None:
        emit("error", message="wandb.init returned no run (is WANDB_MODE=disabled?)")
        return 3
    emit("started", url=getattr(run, "url", None), entity=getattr(run, "entity", None),
         project=getattr(run, "project", None), id=getattr(run, "id", args.id))
    try:
        # Why a step key: W&B drops a step lower than the last one, and Aster rows may
        # interleave splits or use fractional steps.
        run.define_metric(STEP_KEY)
        run.define_metric("*", step_metric=STEP_KEY)
    except Exception as error:
        emit("warning", message="charts use W&B's own step: " + short(error))
    done = 0
    try:
        done = int(run.summary.get(ROWS_KEY) or 0)
    except Exception:
        done = 0
    reader = RowReader(args.metrics)
    logged = 0

    def drain(final=False):
        nonlocal done, logged
        before = done
        for number, row in reader.read(final):
            if number <= done:
                continue
            payload = row_payload(row)
            if payload:
                run.log(payload)
                logged += 1
            done = number
        if done != before:
            # Why: a later mirror of the same Run resumes here instead of logging rows twice.
            run.summary[ROWS_KEY] = done

    try:
        while not ended.is_set():
            drain()
            ended.wait(POLL_SECONDS)
        drain(final=True)
    except Exception as error:
        emit("warning", message="stopped copying metrics: " + short(error))
    watchdog = threading.Timer(FINISH_TIMEOUT_SECONDS, lambda: os._exit(4))
    watchdog.daemon = True
    watchdog.start()
    try:
        run.finish(exit_code=exit_code_for(outcome))
    except Exception as error:
        emit("error", message="wandb finish failed: " + short(error))
        return 5
    emit("finished", rows=done, logged=logged, url=getattr(run, "url", None))
    return 0


if __name__ == "__main__":
    sys.path[:] = [entry for entry in sys.path if entry not in ("", os.getcwd())]
    sys.exit(main(sys.argv[1:]))
`
