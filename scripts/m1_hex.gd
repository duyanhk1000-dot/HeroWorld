extends RefCounted

# M1 - Hex grid 7 cols x 8 rows, SRS v2.1 section 3.
# index = row * 7 + col. Storage uses offset odd-r, pathfinding uses axial.
const COLS := 7
const ROWS := 8
const BOARD_SIZE := 56

static func rc_to_index(row: int, col: int) -> int:
	return row * COLS + col

static func index_to_row(idx: int) -> int:
	return idx / COLS

static func index_to_col(idx: int) -> int:
	return idx % COLS

static func in_bounds(row: int, col: int) -> bool:
	return row >= 0 and row < ROWS and col >= 0 and col < COLS

static func offset_to_axial(col: int, row: int) -> Vector2i:
	# SRS 3.2: q = col - (row - (row & 1)) / 2, r = row
	var q := col - (row - (row & 1)) / 2
	return Vector2i(q, row)

static func axial_to_offset(q: int, r: int) -> Vector2i:
	# SRS 3.2: col = q + (r - (r & 1)) / 2, row = r
	var col := q + (r - (r & 1)) / 2
	return Vector2i(col, r)

static func hex_distance(a_idx: int, b_idx: int) -> int:
	var a := offset_to_axial(index_to_col(a_idx), index_to_row(a_idx))
	var b := offset_to_axial(index_to_col(b_idx), index_to_row(b_idx))
	var dq := a.x - b.x
	var dr := a.y - b.y
	return (abs(dq) + abs(dr) + abs(dq + dr)) / 2

static func neighbors(idx: int) -> Array:
	var out: Array = []
	var ax := offset_to_axial(index_to_col(idx), index_to_row(idx))
	var dirs: Array = [Vector2i(1, 0), Vector2i(1, -1), Vector2i(0, -1), Vector2i(-1, 0), Vector2i(-1, 1), Vector2i(0, 1)]
	for d in dirs:
		var o := axial_to_offset(ax.x + d.x, ax.y + d.y)
		if in_bounds(o.y, o.x):
			out.append(rc_to_index(o.y, o.x))
	return out

# BFS: first step from from_idx toward any cell within `rng` of target_idx.
# Cells in `blocked` (Dictionary used as a set) cannot be entered, except
# cells already within range of the target. Returns -1 when already in range
# or when no path exists.
static func bfs_step_toward(from_idx: int, target_idx: int, rng: int, blocked: Dictionary) -> int:
	if hex_distance(from_idx, target_idx) <= rng:
		return -1
	var prev := {}
	var queue: Array = [from_idx]
	prev[from_idx] = -1
	var head := 0
	while head < queue.size():
		var cur: int = queue[head]
		head += 1
		for nb in neighbors(cur):
			if prev.has(nb):
				continue
			if blocked.has(nb):
				continue
			prev[nb] = cur
			# Goal: a cell (not the target cell itself) within range.
			if nb != target_idx and hex_distance(nb, target_idx) <= rng:
				# Walk back to the first step from from_idx.
				var step: int = nb
				while prev[step] != from_idx:
					step = prev[step]
				return step
			queue.append(nb)
	return -1
