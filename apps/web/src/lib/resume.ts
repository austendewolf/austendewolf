export type ResumeRole = {
  title: string;
  company: string;
  dates: string;
  location: string;
  bullets: string[];
};

export type ResumeFounded = {
  name: string;
  link: string;
  dates: string;
  location: string;
  description: string;
};

export type ResumeSkillGroup = {
  category: string;
  items: string[];
};

export type Resume = {
  name: string;
  contact: {
    email: string;
    phone: string;
    linkedin: string;
  };
  tagline: string[];
  summary: string;
  experience: ResumeRole[];
  founded: ResumeFounded[];
  skills: ResumeSkillGroup[];
  education: {
    school: string;
    dates: string;
    degree: string;
  };
};

export const resume: Resume = {
  name: "Austen DeWolf",
  contact: {
    email: "91.adewolf@gmail.com",
    phone: "(480) 442-5263",
    linkedin: "linkedin.com/in/austendewolf",
  },
  tagline: [
    "Director of Engineering",
    "AI-Native Product Builder",
    "Full-Stack SaaS",
    "Founder",
  ],
  summary:
    "Engineering leader and multiple-time founder with 12+ years building customer-facing software at companies ranging from early-stage startups to public SaaS platforms. I operate at the intersection of product and engineering — equally comfortable defining technical strategy and shaping roadmaps as I am reviewing architecture and shipping code. Track record of building engineering organizations from the ground up, driving measurable business outcomes (31% ARR growth, 100% product line growth, 60% velocity improvement), and leading teams through zero-to-one product launches, platform re-architectures, and an IPO.",
  experience: [
    {
      title: "Senior Engineering Manager, Product Engineering",
      company: "HOVER Inc.",
      dates: "Jul 2023 – Present",
      location: "Greater Seattle Area · Remote",
      bullets: [
        "Lead engineering for Hover's largest product vertical — the Estimates organization — generating tens of millions in ARR with strong year-over-year growth; the suite powers estimation, material lists, blueprints, checklists, and direct ordering for construction contractors",
        "Run a vertically integrated team of 12 engineers spanning full-stack, backend, frontend, mobile, and applied research, owning every product surface from ideation through delivery to the customer's hands",
        "Drove near 100% growth across multiple product lines while increasing engineering velocity by ~60% through pragmatic architecture and disciplined execution",
        "Reduced KTLO burden from 43% to 28%, freeing the team to focus on high-impact, customer-facing work",
        "Shipped AI-powered estimation and trade expansion features, including a centralized regionalized pricing engine that helps contractors maximize margins across markets",
        "Partner closely with product, design, analytics, research, and infrastructure teams to align engineering investment with business outcomes",
      ],
    },
    {
      title: "Director of Engineering",
      company: "Tagboard",
      dates: "Jan 2020 – Feb 2023",
      location: "Seattle, WA",
      bullets: [
        "Ran product and engineering organizations reporting directly to CEO; joined as first engineering hire and scaled the team from 4 to 20+ engineers while building the product org from zero (0 to 3 PMs)",
        "Built and executed long-term strategy for product and engineering resulting in 31% increase in annual recurring revenue (2021–2022)",
        "Owned delivery of Tagboard Interactive (real-time audience engagement), driving a 28% increase in average contract value and $500K+ in pre-launch commitments",
        "Led evolution of Tagboard Graphics into a real-time, edge-rendered broadcast graphics system handling millions of impressions per second with massive peak-load swings",
        "Drove platform consolidation of fragmented microservices architecture, reducing infrastructure costs and increasing team capacity for product investment",
        "Supported fundraising efforts, building the technical narrative and product vision that contributed to Tagboard's $10.3M Series A",
        "Introduced user research, A/B testing, journey mapping, and prototyping as standards in the product development process",
      ],
    },
    {
      title: "Senior Software Engineer",
      company: "Smartsheet",
      dates: "Jun 2018 – Jan 2020",
      location: "Bellevue, WA",
      bullets: [
        "Employee #97 at Smartsheet, joining pre-IPO and contributing to the company's NYSE listing (SMAR) at ~$1.9B valuation in 2018",
        "Designed and developed user-facing features across a platform used by millions daily, working closely with product, sales, and support",
        "Lead front-end developer for the launch of Smartsheet Dynamic View, spanning distributed components and services",
        "Mentored junior engineers through pair programming, design sessions, and code reviews",
      ],
    },
    {
      title: "Solutions Architect",
      company: "Smartsheet",
      dates: "Oct 2016 – Jun 2018",
      location: "Bellevue, WA",
      bullets: [
        "Led technical consulting engagements with Fortune 100 and Fortune 500 customers, designing and deploying scalable enterprise solutions",
        "Partnered with cross-functional teams of consultants, engineers, and product managers to deliver enterprise-grade applications",
        "Early contributor to what became the collaborative work management category, helping define product-market fit through direct customer engagement",
      ],
    },
    {
      title: "Software Engineer",
      company: "Resource Data Inc.",
      dates: "Jun 2014 – Oct 2016",
      location: "Anchorage, AK",
      bullets: [],
    },
  ],
  founded: [
    {
      name: "Retold",
      link: "retold.live",
      dates: "Jan 2021 – Jun 2023",
      location: "Seattle, WA",
      description:
        "Co-founded a live podcasting platform for real-time audience engagement at scale. Owned product vision, architecture, and user research from zero to launch.",
    },
    {
      name: "Flatly",
      link: "flatly.com",
      dates: "Jan 2016 – Dec 2018",
      location: "Seattle, WA",
      description:
        "Founded a property management SaaS platform for independent landlords. Led the full lifecycle from customer discovery and product design through development and fundraising.",
    },
  ],
  skills: [
    {
      category: "Leadership",
      items: [
        "Engineering Leadership",
        "Engineering Management",
        "Product Strategy",
        "People Management",
        "Managing Managers",
        "Team Building",
        "Stakeholder Management",
        "Hiring Practices",
      ],
    },
    {
      category: "Technical Strategy",
      items: [
        "Software Architecture",
        "Distributed Systems",
        "Microservices",
        "DevOps",
        "CI/CD",
        "Cloud Computing (AWS)",
        "Scalability",
        "Real-Time Systems",
        "Systems Design",
        "SaaS",
      ],
    },
    {
      category: "AI & Data",
      items: [
        "AI Strategy",
        "Machine Learning",
        "Generative AI",
        "Large Language Models (LLM)",
        "Artificial Intelligence",
      ],
    },
    {
      category: "Languages & Frameworks",
      items: [
        "Python",
        "SQL",
        "JavaScript/TypeScript",
        "React",
        "Ruby on Rails",
        "GraphQL",
        "Full-Stack Development",
      ],
    },
  ],
  education: {
    school: "University of Alaska Anchorage",
    dates: "2009 – 2014",
    degree:
      "Bachelor of Business Administration — Double Major, Management & Management Information Systems",
  },
};
