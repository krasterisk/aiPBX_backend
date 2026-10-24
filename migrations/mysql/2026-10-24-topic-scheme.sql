-- Run once with the deployment migration receipt; existing projects remain legacy.
ALTER TABLE operator_projects ADD COLUMN topicSchemeState JSON NULL;
