# AGENTS.md - Co Nhan Pham Fantasy Godot Project

## Project
- Godot 4.7.2, GL Compatibility, main scene res://main.tscn, main script res://scripts/main.gd
- Data: res://scripts/heroes_data.gd - 8 heroes, enemies per round, synergy
- Fennara 0.4.3 installed at res://addons/fennara/

## Fennara
- Read res://addons/fennara/ai/guidelines.md before Godot work.
- Use ordinary file tools for reading/searching files. Use Fennara tools for Godot-aware state: get_scene_tree, get_node_properties, write_or_update_file, run_scene_edit_script, runtime_session, screenshot_scene.
- Call fennara_status when connection or project binding is uncertain.
- Do not modify res://addons/fennara/ unless the user asks to repair or uninstall Fennara.
- Fennara is editor-only. It is removed on export.

## Rules for this game
- Keep spec in ../co-nhan-pham-fantasy-spec.md as source of truth for heroes, costs, rounds and economy.
- Star multiplier is pow(1.8, star-1). Board is 4x4 (16 cells). Shop has 5 slots. Start 5 gold, +5 per round, roll costs 2 gold.
- Test headless after every change: ~/workspace/tools/godot/godot --headless --path ~/workspace/co-nhan-pham-godot --quit-after 5
- Headless test must print CO_NHAN_PHAM_GODOT_OK.

## Reusable scripts
- Save screenshot workers under res://.fennara/scripts/screenshots/
- Save runtime probes under res://.fennara/scripts/runtime/
