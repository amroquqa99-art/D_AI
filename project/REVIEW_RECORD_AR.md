# سجل مراجعة الخطة

## نطاق المراجعة

في 2026-10-04 راجع ستة وكلاء الحزمة الأصلية كاملة بصورة مستقلة، ثم دمج القائد النتائج بعد فحص المصدر الرسمي وبنيته العليا. لم يعدل الوكلاء ملفات المصدر أو المواصفات.

| المراجعة | التركيز | أبرز الأثر على الخطة |
|---|---|---|
| Product Scope | الرحلات والمتطلبات والتبعيات | Investigation Alpha أولًا، فصل backlog عن نضج الميزة، وتقديم الأمن والاستمرارية |
| Architecture | modules/data/APIs/scale | Modular Monolith، plugin-first، Postgres مرشح، source-of-truth ADR |
| Security & Data | threat model/ABAC/privacy/AI safety | الأمن workstream من M1، تصنيف وretention، PEP/approval binding، domain limits |
| UX & Frontend | الشاشات/flows/RTL/a11y | mission-centered IA، shared system slots، WCAG 2.2 AA وRTL منذ App Shell |
| QA/DevOps/SRE | tests/CI/recovery/releases | fault injection، fixture/live separation، checkpoints، restore وrelease evidence |
| Independent Challenge | feasibility/Go-No-Go/estimates | GO مشروط لـPhase 0، نطاق زمني أوسع، ومنع الاستخدام الحساس قبل pilot |

## نقاط الاتفاق

- المواصفات رؤية قوية لكنها لا تكفي وحدها كخطة تنفيذ.
- المصدر الرسمي يجب تثبيته وتشغيل baseline قبل architecture نهائية؛ تم العثور عليه وتثبيت SHA، وبقي التشغيل لـM1.
- أفضل مسار هو plugin/profile/bundle داخل Harness مع core delta محدود.
- بناء الأنظمة الستة كاملًا بالتوازي يرفع خطر عدم الوصول إلى منتج؛ Investigation هو vertical slice المرجعي.
- identity/workspace scope، policy/approval/audit، durability وevidence تبدأ قبل المجال الأول.
- الأمن وRTL والوصولية والمراقبة لا تؤجل إلى النهاية.
- النواة المحلية تبدأ بالحوكمة والقياس، وليس training تلقائيًا.
- ملف حالة/checkpoints وFeature Matrix القائمة على الأدلة لازمة لاستمرارية المشروع.

## اختلافات تحتاج قرارًا

أكبر اختلاف هو قاموس Feature Status: أغلب الوثائق والمراجعات تفضل `PARTIAL`، بينما المواصفة المقفلة ومراجع مستقل اقترحا `IMPLEMENTED`. لم تُحل المسألة ضمنيًا؛ سجلت كـD-006.

تفاوتت التقديرات لأن بعض المراجعات قدّرت منصة هندسية أولية وبعضها ضم خبراء المجالات والـpilot والتدقيق. اعتمدت الخطة النطاق الأوسع: Alpha داخلي 5–8 أشهر، Beta متعدد المجالات 12–20 شهرًا، وإنتاج حساس 18–30 شهرًا، مع إعادة تقدير إلزامية بعد M1.

اختلف مستوى الاعتماد المقترح على PostgreSQL مقابل مخازن Harness الحالية. اعتبرته الخطة قرارًا مرشحًا لا نهائيًا حتى Reality Check وADR مصدر الحقيقة.
