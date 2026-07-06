
CREATE TABLE IF NOT EXISTS "ContributionRequest" (
    id TEXT PRIMARY KEY,
    memberId TEXT NOT NULL,
    groupId TEXT NOT NULL,
    amount TEXT NOT NULL,
    cycle TEXT,
    status TEXT DEFAULT 'PENDING',
    rejectionReason TEXT,
    createdAt TEXT NOT NULL,
    confirmedAt TEXT,
    confirmedBy TEXT,
    FOREIGN KEY (memberId) REFERENCES "Member"(id) ON DELETE CASCADE,
    FOREIGN KEY (groupId) REFERENCES "Group"(id) ON DELETE CASCADE,
    FOREIGN KEY (confirmedBy) REFERENCES "Member"(id) ON DELETE SET NULL
);
