from pipeline.metrics import forecast_volume


def test_forecast_decaying_story_decays():
    predicted = forecast_volume([40, 25, 15, 9, 5])
    assert len(predicted) == 3
    assert predicted[0] < 5  # continues the decay
    assert predicted[0] > predicted[1] > predicted[2]
    assert all(p >= 0 for p in predicted)


def test_forecast_growing_story_grows():
    predicted = forecast_volume([2, 5, 11, 20])
    assert predicted[0] > 20


def test_forecast_needs_two_days():
    assert forecast_volume([19]) == []
    assert forecast_volume([]) == []
