from __future__ import annotations

from collections import defaultdict
from math import hypot
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "vw_crafter_preview" / "composite.png"
DESTINATION = ROOT / "vw crafter.svg"

PALETTE = np.array(
    [
        [255, 255, 255],  # transparent background / cut-outs
        [0, 0, 0],        # body and tyres
        [230, 230, 230],  # windows
        [157, 31, 23],    # rear lamp
    ],
    dtype=np.int16,
)
FILLS = {1: "#000000", 2: "#e6e6e6", 3: "#9d1f17"}


def classify(image: Image.Image) -> np.ndarray:
    pixels = np.asarray(image.convert("RGB"), dtype=np.int32)
    palette = PALETTE.astype(np.int32)
    distance = ((pixels[:, :, None, :] - palette[None, None, :, :]) ** 2).sum(axis=3)
    return distance.argmin(axis=2)


def boundary_loops(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    height, width = mask.shape
    edges: set[tuple[tuple[int, int], tuple[int, int]]] = set()
    ys, xs = np.nonzero(mask)

    for y, x in zip(ys.tolist(), xs.tolist()):
        if y == 0 or not mask[y - 1, x]:
            edges.add(((x, y), (x + 1, y)))
        if x == width - 1 or not mask[y, x + 1]:
            edges.add(((x + 1, y), (x + 1, y + 1)))
        if y == height - 1 or not mask[y + 1, x]:
            edges.add(((x + 1, y + 1), (x, y + 1)))
        if x == 0 or not mask[y, x - 1]:
            edges.add(((x, y + 1), (x, y)))

    outgoing: dict[tuple[int, int], set[tuple[int, int]]] = defaultdict(set)
    for start, end in edges:
        outgoing[start].add(end)

    direction_index = {(1, 0): 0, (0, 1): 1, (-1, 0): 2, (0, -1): 3}
    loops: list[list[tuple[int, int]]] = []

    while edges:
        first_edge = next(iter(edges))
        start, current = first_edge
        edges.remove(first_edge)
        outgoing[start].remove(current)
        points = [start, current]
        previous = start

        while current != start:
            candidates = [end for end in outgoing[current] if (current, end) in edges]
            if not candidates:
                break
            incoming = direction_index[(current[0] - previous[0], current[1] - previous[1])]

            def turn_priority(end: tuple[int, int]) -> int:
                outgoing_direction = direction_index[(end[0] - current[0], end[1] - current[1])]
                turn = (outgoing_direction - incoming) % 4
                return {1: 0, 0: 1, 3: 2, 2: 3}[turn]

            following = min(candidates, key=turn_priority)
            edges.remove((current, following))
            outgoing[current].remove(following)
            previous, current = current, following
            points.append(current)

        if len(points) >= 4 and points[-1] == points[0]:
            loops.append(points[:-1])

    return loops


def remove_collinear(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    cleaned: list[tuple[int, int]] = []
    count = len(points)
    for index, point in enumerate(points):
        before = points[index - 1]
        after = points[(index + 1) % count]
        if (point[0] - before[0]) * (after[1] - point[1]) != (
            point[1] - before[1]
        ) * (after[0] - point[0]):
            cleaned.append(point)
    return cleaned


def point_line_distance(
    point: tuple[int, int], start: tuple[int, int], end: tuple[int, int]
) -> float:
    dx, dy = end[0] - start[0], end[1] - start[1]
    if dx == 0 and dy == 0:
        return hypot(point[0] - start[0], point[1] - start[1])
    return abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / hypot(dx, dy)


def rdp(points: list[tuple[int, int]], epsilon: float) -> list[tuple[int, int]]:
    if len(points) <= 2:
        return points
    distances = [point_line_distance(point, points[0], points[-1]) for point in points[1:-1]]
    maximum = max(distances, default=0.0)
    if maximum <= epsilon:
        return [points[0], points[-1]]
    split = distances.index(maximum) + 1
    return rdp(points[: split + 1], epsilon)[:-1] + rdp(points[split:], epsilon)


def simplify_closed(points: list[tuple[int, int]], epsilon: float = 1.15) -> list[tuple[int, int]]:
    points = remove_collinear(points)
    if len(points) < 4:
        return points
    anchor = min(range(len(points)), key=lambda index: (points[index][0], points[index][1]))
    ordered = points[anchor:] + points[:anchor]
    opposite = max(
        range(1, len(ordered)),
        key=lambda index: (ordered[index][0] - ordered[0][0]) ** 2
        + (ordered[index][1] - ordered[0][1]) ** 2,
    )
    first = rdp(ordered[: opposite + 1], epsilon)
    second = rdp(ordered[opposite:] + [ordered[0]], epsilon)
    return first[:-1] + second[:-1]


def polygon_area(points: list[tuple[int, int]]) -> float:
    return abs(
        sum(
            points[index][0] * points[(index + 1) % len(points)][1]
            - points[(index + 1) % len(points)][0] * points[index][1]
            for index in range(len(points))
        )
    ) / 2


def path_data(loops: list[list[tuple[int, int]]], label: int) -> str:
    parts: list[str] = []
    for loop in loops:
        if polygon_area(loop) < 20:
            continue
        left = min(point[0] for point in loop)
        top = min(point[1] for point in loop)
        right = max(point[0] for point in loop)
        bottom = max(point[1] for point in loop)
        if label == 1 and 55 <= right - left <= 65 and 55 <= bottom - top <= 65:
            center_x = (left + right) / 2
            center_y = (top + bottom) / 2
            radius = ((right - left) + (bottom - top)) / 4
            parts.append(
                f"M{center_x:g} {center_y - radius:g} "
                f"A{radius:g} {radius:g} 0 1 0 {center_x:g} {center_y + radius:g} "
                f"A{radius:g} {radius:g} 0 1 0 {center_x:g} {center_y - radius:g} Z"
            )
            continue
        points = simplify_closed(loop)
        if len(points) < 3:
            continue
        parts.append(f"M{points[0][0]} {points[0][1]}")
        parts.extend(f"L{x} {y}" for x, y in points[1:])
        parts.append("Z")
    return " ".join(parts)


def main() -> None:
    image = Image.open(SOURCE)
    labels = classify(image)
    width, height = image.size
    paths: list[str] = []

    for label, fill in FILLS.items():
        loops = boundary_loops(labels == label)
        data = path_data(loops, label)
        if data:
            paths.append(f'  <path fill="{fill}" fill-rule="evenodd" d="{data}"/>')
        print(fill, "pixels=", int((labels == label).sum()), "contours=", len(loops))

    svg = "\n".join(
        [
            '<?xml version="1.0" encoding="UTF-8"?>',
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">',
            "  <title>VW Crafter</title>",
            *paths,
            "</svg>",
            "",
        ]
    )
    DESTINATION.write_text(svg, encoding="utf-8")
    print(DESTINATION, DESTINATION.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
