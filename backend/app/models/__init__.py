from app.models.complaint import (  # noqa: F401
    AiAnalysis, Assignment, AuditLog, Comment, Complaint, ComplaintFollower, ComplaintImage, ComplaintLink,
    ComplaintSubmission, DuplicateCandidate, Notification, ResolutionEvidence, StatusHistory, VoiceTranscript,
)
from app.models.garbage import (  # noqa: F401
    BinReading, CollectionEvent, GarbageBin, GarbageRoute, GarbageVehicle, VehicleLocation,
)
from app.models.recognition import (  # noqa: F401
    Achievement, Certificate, CivicPointsLedger, Game, GameSession, UserAchievement,
)
from app.models.reference import (  # noqa: F401
    Agency, AppSetting, Category, Department, RoutingRule, ServiceBoundary, SlaPolicy, User,
)
