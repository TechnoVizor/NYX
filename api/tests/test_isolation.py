from app.db import engine


def test_tests_never_touch_the_real_database():
    assert engine.url.database.endswith("_test")
