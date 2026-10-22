from pkg.window import moving_sum


def test_moving_sum_basic():
    assert moving_sum([1, 2, 3, 4], 2) == [3, 5, 7]


def test_moving_sum_single_element_window():
    assert moving_sum([5], 1) == [5]


def test_moving_sum_full_window():
    assert moving_sum([1, 2, 3], 3) == [6]


def test_moving_sum_repeated():
    assert moving_sum([7, 7, 7, 7], 2) == [14, 14, 14]
