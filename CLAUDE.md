## Projektkarte (graphify)

Auf Sāmi-Ras Mac liegt unter `graphify-out/` eine Karte des Codes. Vor Code-Arbeit hier zuerst den Skill **projektkarte** nutzen (`~/.local/bin/graphify query|explain|affected …`) statt den Ordner zu durchsuchen; die genannten Dateien danach gezielt lesen. Nach jedem Commit frischt ein lokaler post-commit-Hook die Karte von selbst auf, ohne KI; nach Änderungen ohne Commit von Hand `~/.local/bin/graphify update . && ~/.local/bin/graphify cluster-only . --no-label`. Auf anderen Rechnern ohne graphify entfällt das.
