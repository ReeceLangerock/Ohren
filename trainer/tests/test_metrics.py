from wakeword_trainer.train import parse_metrics

LOG = """Training: 100%|##########| 50000/50000
################
Final Model Accuracy: 0.7412
Final Model Recall: 0.4799
Final Model False Positives per Hour: 0.2688
################
"""


def test_parses_final_metrics():
    assert parse_metrics(LOG) == {"accuracy": 0.7412, "recall": 0.4799, "falsePositivesPerHour": 0.2688}


def test_missing_metrics_is_empty():
    assert parse_metrics("crashed") == {}
