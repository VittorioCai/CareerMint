-- 202608140006 took execute on the legacy interview RPCs away from
-- authenticated users and missed this one. Nothing in the application calls
-- it, and no other function does either: job-specific questions reach an
-- application through accept_interview_question_candidates. The function
-- stays, as the other two did; only the ability to call it goes.
revoke execute on function public.link_interview_question_to_application(uuid, uuid, boolean, text)
from authenticated;
