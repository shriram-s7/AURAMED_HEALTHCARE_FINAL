"""A demo restart must preserve saved work rather than recreate its database."""
import os
from pathlib import Path
import sqlite3
import subprocess
import sys


def test_demo_launcher_preserves_database_on_restart(tmp_path):
    database = tmp_path / 'demonstration.db'
    backend = Path(__file__).resolve().parents[1]
    environment = {**os.environ, 'AURAMED_DEMO_DB_PATH': str(database)}
    command = [sys.executable, '-c', "import runpy; runpy.run_path('tests/run_sqlite_server.py', run_name='workflow_restart_test')"]
    first = subprocess.run(command, cwd=backend, env=environment, capture_output=True, text=True, timeout=120)
    assert first.returncode == 0, first.stderr
    with sqlite3.connect(database) as connection:
        doctor_id = connection.execute("SELECT id FROM users WHERE email='testdr1@auramed.com'").fetchone()[0]
        connection.execute('CREATE TABLE workflow_restart_marker (note TEXT)')
        connection.execute("INSERT INTO workflow_restart_marker VALUES ('Saved work survives restart')")
    second = subprocess.run(command, cwd=backend, env=environment, capture_output=True, text=True, timeout=120)
    assert second.returncode == 0, second.stderr
    with sqlite3.connect(database) as connection:
        assert connection.execute('SELECT note FROM workflow_restart_marker').fetchone()[0] == 'Saved work survives restart'
        assert connection.execute("SELECT id FROM users WHERE email='testdr1@auramed.com'").fetchone()[0] == doctor_id
