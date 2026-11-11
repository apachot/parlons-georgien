"""Build compact crossword layouts from the Georgian vocabulary bank."""

import random
import unicodedata


def _letters(item):
    word = item.get("ka", "")
    if not word or not item.get("fr"):
        return None
    letters = list(word)
    if len(letters) < 3 or not all(unicodedata.category(char).startswith("L") for char in letters):
        return None
    return letters


def _cells(placement):
    row_step, col_step = (0, 1) if placement["direction"] == "across" else (1, 0)
    return [(placement["row"] + row_step * offset,
             placement["col"] + col_step * offset)
            for offset in range(len(placement["letters"]))]


def _valid_placement(letters, direction, row, col, placements, occupied, size):
    row_step, col_step = (0, 1) if direction == "across" else (1, 0)
    candidate = {
        (row + row_step * offset, col + col_step * offset): char
        for offset, char in enumerate(letters)
    }
    if any(not (0 <= r < size and 0 <= c < size) for r, c in candidate):
        return None

    overlaps = {cell for cell, char in candidate.items()
                if cell in occupied and occupied[cell] == char}
    if any(cell in occupied and occupied[cell] != char for cell, char in candidate.items()):
        return None
    if not overlaps:
        return None

    allowed_touches = set()
    for placement in placements:
        if placement["direction"] == direction:
            if overlaps.intersection(_cells(placement)):
                return None
            continue
        old_cells = _cells(placement)
        for crossing in overlaps.intersection(old_cells):
            dr, dc = (0, 1) if placement["direction"] == "across" else (1, 0)
            for sign in (-1, 1):
                neighbor = (crossing[0] + sign * dr, crossing[1] + sign * dc)
                if neighbor in old_cells:
                    allowed_touches.add(neighbor)

    for r, c in candidate:
        for neighbor in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
            if neighbor in occupied and neighbor not in candidate and neighbor not in allowed_touches:
                return None
    return {"direction": direction, "row": row, "col": col,
            "letters": letters, "crossings": len(overlaps)}


def _candidate_placements(item, placements, occupied, size):
    letters = _letters(item)
    if not letters:
        return []
    choices = {}
    for existing in placements:
        direction = "down" if existing["direction"] == "across" else "across"
        for old_index, old_letter in enumerate(existing["letters"]):
            for new_index, new_letter in enumerate(letters):
                if old_letter != new_letter:
                    continue
                old_cell = _cells(existing)[old_index]
                row = old_cell[0] - (new_index if direction == "down" else 0)
                col = old_cell[1] - (new_index if direction == "across" else 0)
                key = (direction, row, col)
                if key in choices:
                    continue
                placement = _valid_placement(letters, direction, row, col,
                                             placements, occupied, size)
                if placement:
                    choices[key] = placement
    return list(choices.values())


def _bounds(placements):
    cells = [cell for placement in placements for cell in _cells(placement)]
    return min(r for r, _ in cells), max(r for r, _ in cells), min(c for _, c in cells), max(c for _, c in cells)


def build_crossword(items, target=6, size=15, attempts=24):
    """Return connected horizontal/vertical entries with at least one crossing each."""
    eligible = [item for item in items if _letters(item)]
    best = []
    for _ in range(attempts):
        pool = random.sample(eligible, min(len(eligible), 24))
        start_item = random.choice(pool)
        start_letters = _letters(start_item)
        if len(start_letters) > size - 2:
            continue
        placements = [{"item": start_item, "direction": "across", "row": size // 2,
                       "col": (size - len(start_letters)) // 2, "letters": start_letters}]
        occupied = dict(zip(_cells(placements[0]), start_letters))
        remaining = [item for item in pool if item["id"] != start_item["id"]]

        while remaining and len(placements) < target:
            choices = []
            for item in remaining:
                for placement in _candidate_placements(item, placements, occupied, size):
                    bounds = _bounds([*placements, placement])
                    area = (bounds[1] - bounds[0] + 1) * (bounds[3] - bounds[2] + 1)
                    choices.append((placement["crossings"], area, random.random(), item, placement))
            if not choices:
                break
            max_crossings = max(choice[0] for choice in choices)
            choices = [choice for choice in choices if choice[0] == max_crossings]
            min_area = min(choice[1] for choice in choices)
            choices = [choice for choice in choices if choice[1] <= min_area + 8]
            _, _, _, item, placement = min(choices, key=lambda choice: choice[2])
            placement["item"] = item
            placements.append(placement)
            occupied.update(zip(_cells(placement), placement["letters"]))
            remaining = [candidate for candidate in remaining if candidate["id"] != item["id"]]

        if len(placements) > len(best):
            best = placements
        if len(placements) >= target:
            break

    if len(best) < 2:
        return None

    min_row, max_row, min_col, max_col = _bounds(best)
    starts = {}
    for placement in sorted(best, key=lambda entry: (entry["row"], entry["col"])):
        start = (placement["row"], placement["col"])
        if start not in starts:
            starts[start] = len(starts) + 1

    entries = []
    for placement in best:
        item = placement["item"]
        entries.append({"id": item["id"], "fr": item["fr"], "ka": item["ka"],
                        "direction": placement["direction"],
                        "number": starts[(placement["row"], placement["col"])],
                        "cells": [[r - min_row, c - min_col] for r, c in _cells(placement)]})
    return {"rows": max_row - min_row + 1, "columns": max_col - min_col + 1,
            "entries": entries}
