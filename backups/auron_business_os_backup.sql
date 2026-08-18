--
-- PostgreSQL database dump
--

\restrict eWytpV1KHNguy7Gx96YKNSxmwd7YPTy4F0VaO6Aegf5s2KhjlmxTaxKJnqcaMH1

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: assets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.assets (
    id integer NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    purchase_date date NOT NULL,
    purchase_cost numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    current_book_value numeric(15,2),
    storage_location text,
    condition text DEFAULT 'good'::text NOT NULL,
    maintenance_cost numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    rental_value numeric(15,2),
    notes text,
    is_demo boolean DEFAULT false NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.assets OWNER TO postgres;

--
-- Name: assets_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.assets_id_seq OWNER TO postgres;

--
-- Name: assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.assets_id_seq OWNED BY public.assets.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    user_id text NOT NULL,
    user_email text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id integer NOT NULL,
    old_values jsonb,
    new_values jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_logs_id_seq OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: clients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clients (
    id integer NOT NULL,
    name text NOT NULL,
    company text,
    contact_person text,
    phone text,
    email text,
    location text,
    client_type text DEFAULT 'Corporate'::text NOT NULL,
    industry text,
    lead_source text,
    notes text,
    is_demo boolean DEFAULT false NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.clients OWNER TO postgres;

--
-- Name: clients_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.clients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clients_id_seq OWNER TO postgres;

--
-- Name: clients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.clients_id_seq OWNED BY public.clients.id;


--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.company_settings (
    id integer NOT NULL,
    company_name text DEFAULT 'Auron Event Productions'::text NOT NULL,
    country text DEFAULT 'India'::text NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    gst_number text,
    gst_rate numeric(5,2) DEFAULT '18'::numeric NOT NULL,
    excellent_margin_threshold numeric(5,2) DEFAULT '35'::numeric NOT NULL,
    healthy_margin_threshold numeric(5,2) DEFAULT '20'::numeric NOT NULL,
    warning_margin_threshold numeric(5,2) DEFAULT '10'::numeric NOT NULL,
    ltv_cac_target numeric(8,2) DEFAULT '3'::numeric NOT NULL,
    cac_target numeric(15,2),
    valuation_target numeric(18,2) DEFAULT '900000000'::numeric NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.company_settings OWNER TO postgres;

--
-- Name: company_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.company_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.company_settings_id_seq OWNER TO postgres;

--
-- Name: company_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.company_settings_id_seq OWNED BY public.company_settings.id;


--
-- Name: employees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employees (
    id integer NOT NULL,
    name text NOT NULL,
    role text NOT NULL,
    department text NOT NULL,
    salary numeric(15,2),
    joining_date date NOT NULL,
    responsibilities text,
    is_active boolean DEFAULT true NOT NULL,
    is_demo boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.employees OWNER TO postgres;

--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.employees_id_seq OWNER TO postgres;

--
-- Name: employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.employees_id_seq OWNED BY public.employees.id;


--
-- Name: event_costs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_costs (
    id integer NOT NULL,
    event_id integer NOT NULL,
    vendor_id integer,
    category text NOT NULL,
    description text,
    amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    gst numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    total_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    date date,
    reference_number text,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.event_costs OWNER TO postgres;

--
-- Name: event_costs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.event_costs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.event_costs_id_seq OWNER TO postgres;

--
-- Name: event_costs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.event_costs_id_seq OWNED BY public.event_costs.id;


--
-- Name: event_revenue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_revenue (
    id integer NOT NULL,
    event_id integer NOT NULL,
    contract_value numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    discount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    gst numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    total_invoice_value numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    net_revenue numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    advance_received numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    second_payment numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    final_payment numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    total_collected numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    outstanding_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    invoice_number text,
    due_date date,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.event_revenue OWNER TO postgres;

--
-- Name: event_revenue_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.event_revenue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.event_revenue_id_seq OWNER TO postgres;

--
-- Name: event_revenue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.event_revenue_id_seq OWNED BY public.event_revenue.id;


--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    id integer NOT NULL,
    name text NOT NULL,
    client_id integer NOT NULL,
    event_type text NOT NULL,
    status text DEFAULT 'upcoming'::text NOT NULL,
    event_date date NOT NULL,
    venue text,
    location text,
    salesperson_id integer,
    operations_manager_id integer,
    lead_source text,
    notes text,
    is_demo boolean DEFAULT false NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.events OWNER TO postgres;

--
-- Name: events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.events_id_seq OWNER TO postgres;

--
-- Name: events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.events_id_seq OWNED BY public.events.id;


--
-- Name: leads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leads (
    id integer NOT NULL,
    client_id integer,
    contact_name text NOT NULL,
    contact_phone text,
    contact_email text,
    source text,
    event_type text,
    expected_value numeric(15,2),
    expected_profit numeric(15,2),
    probability integer,
    salesperson_id integer,
    date_received date,
    follow_up_date date,
    status text DEFAULT 'new'::text NOT NULL,
    lost_reason text,
    notes text,
    is_demo boolean DEFAULT false NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.leads OWNER TO postgres;

--
-- Name: leads_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.leads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.leads_id_seq OWNER TO postgres;

--
-- Name: leads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.leads_id_seq OWNED BY public.leads.id;


--
-- Name: marketing_channels; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.marketing_channels (
    id integer NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.marketing_channels OWNER TO postgres;

--
-- Name: marketing_channels_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.marketing_channels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.marketing_channels_id_seq OWNER TO postgres;

--
-- Name: marketing_channels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.marketing_channels_id_seq OWNED BY public.marketing_channels.id;


--
-- Name: marketing_spend; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.marketing_spend (
    id integer NOT NULL,
    channel_id integer NOT NULL,
    amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    leads_generated integer DEFAULT 0 NOT NULL,
    qualified_leads integer DEFAULT 0 NOT NULL,
    customers_acquired integer DEFAULT 0 NOT NULL,
    revenue_generated numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    gross_profit_generated numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.marketing_spend OWNER TO postgres;

--
-- Name: marketing_spend_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.marketing_spend_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.marketing_spend_id_seq OWNER TO postgres;

--
-- Name: marketing_spend_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.marketing_spend_id_seq OWNED BY public.marketing_spend.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id text,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    entity_type text,
    entity_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notifications_id_seq OWNER TO postgres;

--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: operating_expenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.operating_expenses (
    id integer NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    gst numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    date date,
    reference_number text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.operating_expenses OWNER TO postgres;

--
-- Name: operating_expenses_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.operating_expenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.operating_expenses_id_seq OWNER TO postgres;

--
-- Name: operating_expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.operating_expenses_id_seq OWNED BY public.operating_expenses.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sessions (
    sid character varying NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp without time zone NOT NULL
);


ALTER TABLE public.sessions OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email character varying,
    first_name character varying,
    last_name character varying,
    profile_image_url character varying,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: valuation_scenarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.valuation_scenarios (
    id integer NOT NULL,
    name text NOT NULL,
    scenario_type text DEFAULT 'custom'::text NOT NULL,
    target_valuation numeric(18,2) DEFAULT '900000000'::numeric NOT NULL,
    current_revenue numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    current_ebitda numeric(15,2),
    current_net_profit numeric(15,2),
    revenue_growth_rate numeric(8,4) DEFAULT 0.20 NOT NULL,
    ebitda_margin numeric(8,4) DEFAULT 0.15 NOT NULL,
    revenue_multiple numeric(8,2) DEFAULT '3'::numeric NOT NULL,
    ebitda_multiple numeric(8,2) DEFAULT '10'::numeric NOT NULL,
    notes text,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.valuation_scenarios OWNER TO postgres;

--
-- Name: valuation_scenarios_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.valuation_scenarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.valuation_scenarios_id_seq OWNER TO postgres;

--
-- Name: valuation_scenarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.valuation_scenarios_id_seq OWNED BY public.valuation_scenarios.id;


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vendors (
    id integer NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    contact_person text,
    phone text,
    email text,
    location text,
    payment_terms text,
    rating integer,
    notes text,
    is_demo boolean DEFAULT false NOT NULL,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.vendors OWNER TO postgres;

--
-- Name: vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendors_id_seq OWNER TO postgres;

--
-- Name: vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vendors_id_seq OWNED BY public.vendors.id;


--
-- Name: assets id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets ALTER COLUMN id SET DEFAULT nextval('public.assets_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: clients id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients ALTER COLUMN id SET DEFAULT nextval('public.clients_id_seq'::regclass);


--
-- Name: company_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_settings ALTER COLUMN id SET DEFAULT nextval('public.company_settings_id_seq'::regclass);


--
-- Name: employees id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);


--
-- Name: event_costs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_costs ALTER COLUMN id SET DEFAULT nextval('public.event_costs_id_seq'::regclass);


--
-- Name: event_revenue id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_revenue ALTER COLUMN id SET DEFAULT nextval('public.event_revenue_id_seq'::regclass);


--
-- Name: events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events ALTER COLUMN id SET DEFAULT nextval('public.events_id_seq'::regclass);


--
-- Name: leads id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leads ALTER COLUMN id SET DEFAULT nextval('public.leads_id_seq'::regclass);


--
-- Name: marketing_channels id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketing_channels ALTER COLUMN id SET DEFAULT nextval('public.marketing_channels_id_seq'::regclass);


--
-- Name: marketing_spend id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketing_spend ALTER COLUMN id SET DEFAULT nextval('public.marketing_spend_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: operating_expenses id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.operating_expenses ALTER COLUMN id SET DEFAULT nextval('public.operating_expenses_id_seq'::regclass);


--
-- Name: valuation_scenarios id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.valuation_scenarios ALTER COLUMN id SET DEFAULT nextval('public.valuation_scenarios_id_seq'::regclass);


--
-- Name: vendors id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendors ALTER COLUMN id SET DEFAULT nextval('public.vendors_id_seq'::regclass);


--
-- Data for Name: assets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.assets (id, name, category, purchase_date, purchase_cost, current_book_value, storage_location, condition, maintenance_cost, rental_value, notes, is_demo, created_by, updated_by, created_at, updated_at) FROM stdin;
1	Martin MAC 700 Moving Head x8	Lighting	2021-03-15	480000.00	350000.00	Warehouse A	excellent	0.00	\N	\N	f	\N	\N	2026-08-18 14:19:37.964558+00	2026-08-18 14:19:37.964558+00
2	L-Acoustics KARA Line Array System	AV Equipment	2022-01-20	1200000.00	980000.00	Warehouse A	excellent	0.00	35000.00	\N	f	\N	\N	2026-08-18 14:19:37.964558+00	2026-08-18 14:19:37.964558+00
3	LED Video Wall 20sqm Panel Set	Displays	2022-06-10	850000.00	680000.00	Warehouse B	good	0.00	25000.00	\N	f	\N	\N	2026-08-18 14:19:37.964558+00	2026-08-18 14:19:37.964558+00
4	Event Management Vehicle (Tempo)	Vehicles	2020-11-01	650000.00	420000.00	Office Parking	good	0.00	\N	\N	f	\N	\N	2026-08-18 14:19:37.964558+00	2026-08-18 14:19:37.964558+00
5	Stage Platform 40x30ft	Stage Equipment	2021-08-15	320000.00	260000.00	Warehouse B	good	0.00	\N	\N	f	\N	\N	2026-08-18 14:19:37.964558+00	2026-08-18 14:19:37.964558+00
6	Truss Rig System - Complete Set	Rigging	2021-09-01	180000.00	145000.00	Warehouse A	excellent	0.00	\N	\N	f	\N	\N	2026-08-18 14:19:37.964558+00	2026-08-18 14:19:37.964558+00
7	Genset 125 KVA	Power	2022-03-10	550000.00	450000.00	Warehouse B	good	0.00	\N	\N	f	\N	\N	2026-08-18 14:19:37.964558+00	2026-08-18 14:19:37.964558+00
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs (id, user_id, user_email, action, entity_type, entity_id, old_values, new_values, created_at) FROM stdin;
1	1	arjun@auroneventproductions.com	create	event	1	\N	{"name": "Vineeth & Aparna Grand Wedding", "status": "upcoming"}	2026-08-18 14:19:38.387107+00
2	3	rahul@auroneventproductions.com	update	lead	2	{"status": "qualified"}	{"status": "negotiation"}	2026-08-18 14:19:38.387107+00
3	5	sanjay@auroneventproductions.com	create	event_revenue	10	\N	{"contractValue": 1900000}	2026-08-18 14:19:38.387107+00
\.


--
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.clients (id, name, company, contact_person, phone, email, location, client_type, industry, lead_source, notes, is_demo, created_by, updated_by, created_at, updated_at) FROM stdin;
1	Vineeth & Aparna	Private Family	\N	9876001001	vineeth@email.com	Kochi	Personal (Wedding)	Individual	Referral	Premium client, very detail-oriented. Repeat business likely.	f	\N	\N	2026-08-18 14:19:38.020505+00	2026-08-18 14:19:38.020505+00
2	TechCorp India Pvt Ltd	TechCorp India Pvt Ltd	HR Head - Ramesh Kumar	9876001002	events@techcorp.in	Thiruvananthapuram	Corporate	Technology	Google Ads	\N	f	\N	\N	2026-08-18 14:19:38.020505+00	2026-08-18 14:19:38.020505+00
3	Lakshmi & Govind	Private Family	\N	9876001003	\N	Thrissur	Personal (Wedding)	Individual	Instagram	\N	f	\N	\N	2026-08-18 14:19:38.020505+00	2026-08-18 14:19:38.020505+00
4	Kerala Medical Association	Kerala Medical Association	Dr. Suresh Pillai	9876001004	events@kma.org	Kochi	Association	Healthcare	Exhibition	\N	f	\N	\N	2026-08-18 14:19:38.020505+00	2026-08-18 14:19:38.020505+00
5	Muthoot Finance Ltd	Muthoot Finance Ltd	Admin Head	9876001005	admin.events@muthoot.com	Kochi	Corporate	Finance	Referral	\N	f	\N	\N	2026-08-18 14:19:38.020505+00	2026-08-18 14:19:38.020505+00
6	Arun & Meera	Private Family	\N	9876001006	\N	Kozhikode	Personal (Wedding)	Individual	WhatsApp	\N	f	\N	\N	2026-08-18 14:19:38.020505+00	2026-08-18 14:19:38.020505+00
7	Kerala IT Mission	Kerala IT Mission	Jyothi Krishnan	9876001007	\N	Thiruvananthapuram	Government	Technology	Direct Inquiry	\N	f	\N	\N	2026-08-18 14:19:38.020505+00	2026-08-18 14:19:38.020505+00
8	HDFC Bank - Kerala Zone	HDFC Bank Ltd	Zonal HR Manager	9876001008	\N	Kochi	Corporate	Finance	Referral	\N	f	\N	\N	2026-08-18 14:19:38.020505+00	2026-08-18 14:19:38.020505+00
9	Sreekanth & Devika	Private Family	\N	9876001009	\N	Palakkad	Personal (Wedding)	Individual	Instagram	\N	f	\N	\N	2026-08-18 14:19:38.020505+00	2026-08-18 14:19:38.020505+00
10	Kairali Hotels Group	Kairali Hotels Group	Biju Mathew	9876001010	events@kairali.com	Kochi	Corporate	Hospitality	Referral	\N	f	\N	\N	2026-08-18 14:19:38.020505+00	2026-08-18 14:19:38.020505+00
\.


--
-- Data for Name: company_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.company_settings (id, company_name, country, currency, gst_number, gst_rate, excellent_margin_threshold, healthy_margin_threshold, warning_margin_threshold, ltv_cac_target, cac_target, valuation_target, updated_at) FROM stdin;
1	Auron Event Productions	India	INR	32AABCA1234A1ZR	18.00	35.00	20.00	10.00	5.00	15000.00	900000000.00	2026-08-18 14:19:37.865611+00
\.


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employees (id, name, role, department, salary, joining_date, responsibilities, is_active, is_demo, created_at, updated_at) FROM stdin;
1	Arjun Nair	CEO & Founder	Leadership	250000.00	2018-06-01	Overall strategy, business development, key client relationships	t	f	2026-08-18 14:19:37.90913+00	2026-08-18 14:19:37.90913+00
2	Priya Menon	Head of Operations	Operations	85000.00	2019-03-15	Event execution, vendor management, logistics	t	f	2026-08-18 14:19:37.914628+00	2026-08-18 14:19:37.914628+00
3	Rahul Krishnan	Senior Sales Manager	Sales	70000.00	2020-01-10	Lead conversion, client proposals, pipeline management	t	f	2026-08-18 14:19:37.919404+00	2026-08-18 14:19:37.919404+00
4	Divya Pillai	Creative Director	Creative	75000.00	2020-08-20	Event design, decor concepts, stage production	t	f	2026-08-18 14:19:37.935099+00	2026-08-18 14:19:37.935099+00
5	Sanjay Kumar	Finance Manager	Finance	65000.00	2021-02-01	P&L management, vendor payments, financial reporting	t	f	2026-08-18 14:19:37.938773+00	2026-08-18 14:19:37.938773+00
6	Anjali Varma	Junior Sales Executive	Sales	35000.00	2022-06-01	Lead qualification, follow-ups, social media outreach	t	f	2026-08-18 14:19:37.942177+00	2026-08-18 14:19:37.942177+00
\.


--
-- Data for Name: event_costs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_costs (id, event_id, vendor_id, category, description, amount, gst, total_amount, payment_status, date, reference_number, created_by, updated_by, created_at, updated_at) FROM stdin;
1	1	2	Decor & Florals	\N	380000.00	68400.00	448400.00	paid	2025-12-18	\N	\N	\N	2026-08-18 14:19:38.029522+00	2026-08-18 14:19:38.029522+00
2	1	1	AV & Lighting	\N	280000.00	50400.00	330400.00	paid	2025-12-18	\N	\N	\N	2026-08-18 14:19:38.033302+00	2026-08-18 14:19:38.033302+00
3	1	3	Catering	\N	450000.00	81000.00	531000.00	paid	2025-12-18	\N	\N	\N	2026-08-18 14:19:38.035953+00	2026-08-18 14:19:38.035953+00
4	1	4	Photography & Video	\N	180000.00	32400.00	212400.00	paid	2025-12-18	\N	\N	\N	2026-08-18 14:19:38.038944+00	2026-08-18 14:19:38.038944+00
5	1	5	Stage & Tent	\N	120000.00	21600.00	141600.00	paid	2025-12-18	\N	\N	\N	2026-08-18 14:19:38.041408+00	2026-08-18 14:19:38.041408+00
6	1	6	Logistics	\N	45000.00	8100.00	53100.00	paid	2025-12-18	\N	\N	\N	2026-08-18 14:19:38.044158+00	2026-08-18 14:19:38.044158+00
7	2	1	AV & Lighting	\N	320000.00	57600.00	377600.00	paid	2025-11-25	\N	\N	\N	2026-08-18 14:19:38.051846+00	2026-08-18 14:19:38.051846+00
8	2	5	Stage & Tent	\N	180000.00	32400.00	212400.00	paid	2025-11-25	\N	\N	\N	2026-08-18 14:19:38.055231+00	2026-08-18 14:19:38.055231+00
9	2	3	Catering	\N	280000.00	50400.00	330400.00	paid	2025-11-25	\N	\N	\N	2026-08-18 14:19:38.059044+00	2026-08-18 14:19:38.059044+00
10	2	6	Logistics	\N	55000.00	9900.00	64900.00	paid	2025-11-25	\N	\N	\N	2026-08-18 14:19:38.06138+00	2026-08-18 14:19:38.06138+00
11	3	1	AV & Lighting	\N	220000.00	39600.00	259600.00	paid	2025-10-14	\N	\N	\N	2026-08-18 14:19:38.074093+00	2026-08-18 14:19:38.074093+00
12	3	3	Catering	\N	210000.00	37800.00	247800.00	paid	2025-10-14	\N	\N	\N	2026-08-18 14:19:38.076884+00	2026-08-18 14:19:38.076884+00
13	3	5	Stage & Tent	\N	90000.00	16200.00	106200.00	paid	2025-10-14	\N	\N	\N	2026-08-18 14:19:38.079925+00	2026-08-18 14:19:38.079925+00
14	3	6	Logistics	\N	35000.00	6300.00	41300.00	paid	2025-10-14	\N	\N	\N	2026-08-18 14:19:38.083384+00	2026-08-18 14:19:38.083384+00
15	4	2	Decor & Florals	\N	320000.00	57600.00	377600.00	paid	2026-01-22	\N	\N	\N	2026-08-18 14:19:38.090792+00	2026-08-18 14:19:38.090792+00
16	4	1	AV & Lighting	\N	250000.00	45000.00	295000.00	paid	2026-01-22	\N	\N	\N	2026-08-18 14:19:38.094097+00	2026-08-18 14:19:38.094097+00
17	4	3	Catering	\N	380000.00	68400.00	448400.00	paid	2026-01-22	\N	\N	\N	2026-08-18 14:19:38.0967+00	2026-08-18 14:19:38.0967+00
18	4	4	Photography & Video	\N	160000.00	28800.00	188800.00	paid	2026-01-22	\N	\N	\N	2026-08-18 14:19:38.099103+00	2026-08-18 14:19:38.099103+00
19	4	5	Stage & Tent	\N	110000.00	19800.00	129800.00	paid	2026-01-22	\N	\N	\N	2026-08-18 14:19:38.102316+00	2026-08-18 14:19:38.102316+00
20	5	1	AV & Lighting	\N	290000.00	52200.00	342200.00	paid	2026-02-10	\N	\N	\N	2026-08-18 14:19:38.113999+00	2026-08-18 14:19:38.113999+00
21	5	5	Stage & Tent	\N	200000.00	36000.00	236000.00	paid	2026-02-10	\N	\N	\N	2026-08-18 14:19:38.116506+00	2026-08-18 14:19:38.116506+00
22	5	3	Catering	\N	350000.00	63000.00	413000.00	paid	2026-02-10	\N	\N	\N	2026-08-18 14:19:38.119362+00	2026-08-18 14:19:38.119362+00
23	5	4	Photography & Video	\N	85000.00	15300.00	100300.00	paid	2026-02-10	\N	\N	\N	2026-08-18 14:19:38.12157+00	2026-08-18 14:19:38.12157+00
24	5	6	Logistics	\N	60000.00	10800.00	70800.00	paid	2026-02-10	\N	\N	\N	2026-08-18 14:19:38.123879+00	2026-08-18 14:19:38.123879+00
25	6	2	Decor & Florals	\N	250000.00	45000.00	295000.00	paid	2026-03-08	\N	\N	\N	2026-08-18 14:19:38.136395+00	2026-08-18 14:19:38.136395+00
26	6	1	AV & Lighting	\N	200000.00	36000.00	236000.00	paid	2026-03-08	\N	\N	\N	2026-08-18 14:19:38.142734+00	2026-08-18 14:19:38.142734+00
27	6	3	Catering	\N	280000.00	50400.00	330400.00	paid	2026-03-08	\N	\N	\N	2026-08-18 14:19:38.145147+00	2026-08-18 14:19:38.145147+00
28	6	4	Photography & Video	\N	120000.00	21600.00	141600.00	paid	2026-03-08	\N	\N	\N	2026-08-18 14:19:38.14898+00	2026-08-18 14:19:38.14898+00
29	7	1	AV & Lighting	\N	480000.00	86400.00	566400.00	paid	2026-04-20	\N	\N	\N	2026-08-18 14:19:38.15755+00	2026-08-18 14:19:38.15755+00
30	7	5	Stage & Tent	\N	380000.00	68400.00	448400.00	paid	2026-04-20	\N	\N	\N	2026-08-18 14:19:38.160871+00	2026-08-18 14:19:38.160871+00
31	7	3	Catering	\N	520000.00	93600.00	613600.00	paid	2026-04-20	\N	\N	\N	2026-08-18 14:19:38.163167+00	2026-08-18 14:19:38.163167+00
32	7	4	Photography & Video	\N	160000.00	28800.00	188800.00	paid	2026-04-20	\N	\N	\N	2026-08-18 14:19:38.165332+00	2026-08-18 14:19:38.165332+00
33	7	6	Logistics	\N	90000.00	16200.00	106200.00	paid	2026-04-20	\N	\N	\N	2026-08-18 14:19:38.16749+00	2026-08-18 14:19:38.16749+00
34	7	2	Decor & Florals	\N	220000.00	39600.00	259600.00	paid	2026-04-20	\N	\N	\N	2026-08-18 14:19:38.170178+00	2026-08-18 14:19:38.170178+00
35	8	1	AV & Lighting	\N	260000.00	46800.00	306800.00	paid	2026-05-15	\N	\N	\N	2026-08-18 14:19:38.177219+00	2026-08-18 14:19:38.177219+00
36	8	3	Catering	\N	300000.00	54000.00	354000.00	paid	2026-05-15	\N	\N	\N	2026-08-18 14:19:38.180433+00	2026-08-18 14:19:38.180433+00
37	8	5	Stage & Tent	\N	150000.00	27000.00	177000.00	paid	2026-05-15	\N	\N	\N	2026-08-18 14:19:38.182808+00	2026-08-18 14:19:38.182808+00
38	8	6	Logistics	\N	45000.00	8100.00	53100.00	paid	2026-05-15	\N	\N	\N	2026-08-18 14:19:38.185161+00	2026-08-18 14:19:38.185161+00
39	9	2	Decor & Florals	\N	450000.00	81000.00	531000.00	paid	2026-06-28	\N	\N	\N	2026-08-18 14:19:38.192379+00	2026-08-18 14:19:38.192379+00
40	9	1	AV & Lighting	\N	320000.00	57600.00	377600.00	paid	2026-06-28	\N	\N	\N	2026-08-18 14:19:38.195342+00	2026-08-18 14:19:38.195342+00
41	9	3	Catering	\N	520000.00	93600.00	613600.00	paid	2026-06-28	\N	\N	\N	2026-08-18 14:19:38.19761+00	2026-08-18 14:19:38.19761+00
42	9	4	Photography & Video	\N	200000.00	36000.00	236000.00	paid	2026-06-28	\N	\N	\N	2026-08-18 14:19:38.200639+00	2026-08-18 14:19:38.200639+00
43	9	5	Stage & Tent	\N	180000.00	32400.00	212400.00	paid	2026-06-28	\N	\N	\N	2026-08-18 14:19:38.202947+00	2026-08-18 14:19:38.202947+00
44	9	6	Logistics	\N	65000.00	11700.00	76700.00	paid	2026-06-28	\N	\N	\N	2026-08-18 14:19:38.205094+00	2026-08-18 14:19:38.205094+00
45	10	1	AV & Lighting	\N	340000.00	61200.00	401200.00	pending	2026-08-25	\N	\N	\N	2026-08-18 14:19:38.212058+00	2026-08-18 14:19:38.212058+00
46	10	5	Stage & Tent	\N	220000.00	39600.00	259600.00	pending	2026-08-25	\N	\N	\N	2026-08-18 14:19:38.214283+00	2026-08-18 14:19:38.214283+00
47	10	3	Catering	\N	400000.00	72000.00	472000.00	pending	2026-08-25	\N	\N	\N	2026-08-18 14:19:38.216342+00	2026-08-18 14:19:38.216342+00
48	10	4	Photography & Video	\N	95000.00	17100.00	112100.00	pending	2026-08-25	\N	\N	\N	2026-08-18 14:19:38.218808+00	2026-08-18 14:19:38.218808+00
49	10	6	Logistics	\N	70000.00	12600.00	82600.00	pending	2026-08-25	\N	\N	\N	2026-08-18 14:19:38.221317+00	2026-08-18 14:19:38.221317+00
50	11	1	AV & Lighting	\N	350000.00	63000.00	413000.00	pending	2026-09-18	\N	\N	\N	2026-08-18 14:19:38.228523+00	2026-08-18 14:19:38.228523+00
51	11	5	Stage & Tent	\N	200000.00	36000.00	236000.00	pending	2026-09-18	\N	\N	\N	2026-08-18 14:19:38.231322+00	2026-08-18 14:19:38.231322+00
52	11	3	Catering	\N	250000.00	45000.00	295000.00	pending	2026-09-18	\N	\N	\N	2026-08-18 14:19:38.233424+00	2026-08-18 14:19:38.233424+00
53	12	2	Decor & Florals	\N	80000.00	14400.00	94400.00	pending	2026-12-18	\N	\N	\N	2026-08-18 14:19:38.239814+00	2026-08-18 14:19:38.239814+00
54	12	3	Catering	\N	100000.00	18000.00	118000.00	pending	2026-12-18	\N	\N	\N	2026-08-18 14:19:38.241973+00	2026-08-18 14:19:38.241973+00
55	12	1	AV & Lighting	\N	60000.00	10800.00	70800.00	pending	2026-12-18	\N	\N	\N	2026-08-18 14:19:38.24405+00	2026-08-18 14:19:38.24405+00
\.


--
-- Data for Name: event_revenue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_revenue (id, event_id, contract_value, discount, gst, total_invoice_value, net_revenue, advance_received, second_payment, final_payment, total_collected, outstanding_amount, payment_status, invoice_number, due_date, created_by, updated_by, created_at, updated_at) FROM stdin;
1	1	2200000.00	0.00	396000.00	2596000.00	2200000.00	800000.00	1000000.00	400000.00	2200000.00	0.00	paid	\N	\N	\N	\N	2026-08-18 14:19:38.027028+00	2026-08-18 14:19:38.027028+00
2	2	1450000.00	50000.00	261000.00	1661000.00	1400000.00	600000.00	600000.00	200000.00	1400000.00	0.00	paid	\N	\N	\N	\N	2026-08-18 14:19:38.049244+00	2026-08-18 14:19:38.049244+00
3	3	980000.00	0.00	176400.00	1156400.00	980000.00	400000.00	400000.00	180000.00	980000.00	0.00	paid	\N	\N	\N	\N	2026-08-18 14:19:38.066834+00	2026-08-18 14:19:38.066834+00
4	4	1850000.00	0.00	333000.00	2183000.00	1850000.00	700000.00	800000.00	350000.00	1850000.00	0.00	paid	\N	\N	\N	\N	2026-08-18 14:19:38.088324+00	2026-08-18 14:19:38.088324+00
5	5	1650000.00	50000.00	297000.00	1897000.00	1600000.00	700000.00	700000.00	200000.00	1600000.00	0.00	paid	\N	\N	\N	\N	2026-08-18 14:19:38.107564+00	2026-08-18 14:19:38.107564+00
6	6	1200000.00	0.00	216000.00	1416000.00	1200000.00	500000.00	500000.00	200000.00	1200000.00	0.00	paid	\N	\N	\N	\N	2026-08-18 14:19:38.132907+00	2026-08-18 14:19:38.132907+00
7	7	2800000.00	0.00	504000.00	3304000.00	2800000.00	1000000.00	1200000.00	600000.00	2800000.00	0.00	paid	\N	\N	\N	\N	2026-08-18 14:19:38.153703+00	2026-08-18 14:19:38.153703+00
8	8	1380000.00	80000.00	248400.00	1548400.00	1300000.00	600000.00	600000.00	132000.00	1332000.00	0.00	paid	\N	\N	\N	\N	2026-08-18 14:19:38.174866+00	2026-08-18 14:19:38.174866+00
9	9	2600000.00	0.00	468000.00	3068000.00	2600000.00	1000000.00	1100000.00	500000.00	2600000.00	0.00	paid	\N	\N	\N	\N	2026-08-18 14:19:38.189955+00	2026-08-18 14:19:38.189955+00
10	10	1900000.00	100000.00	342000.00	2142000.00	1800000.00	800000.00	0.00	0.00	800000.00	1000000.00	partial	\N	2026-10-01	\N	\N	2026-08-18 14:19:38.209793+00	2026-08-18 14:19:38.209793+00
11	11	1600000.00	0.00	288000.00	1888000.00	1600000.00	600000.00	0.00	0.00	600000.00	1000000.00	pending	\N	2026-10-01	\N	\N	2026-08-18 14:19:38.226184+00	2026-08-18 14:19:38.226184+00
12	12	450000.00	0.00	81000.00	531000.00	450000.00	200000.00	0.00	0.00	200000.00	250000.00	pending	\N	2026-10-01	\N	\N	2026-08-18 14:19:38.237748+00	2026-08-18 14:19:38.237748+00
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.events (id, name, client_id, event_type, status, event_date, venue, location, salesperson_id, operations_manager_id, lead_source, notes, is_demo, created_by, updated_by, created_at, updated_at) FROM stdin;
1	Vineeth & Aparna Grand Wedding	1	Wedding	completed	2025-12-18	Le Meridien Kochi	Kochi	3	2	\N	\N	t	\N	\N	2026-08-18 14:19:38.023741+00	2026-08-18 14:19:38.023741+00
2	TechCorp Annual Awards Night	2	Corporate Event	completed	2025-11-25	Crowne Plaza Kochi	Kochi	3	2	\N	\N	t	\N	\N	2026-08-18 14:19:38.047039+00	2026-08-18 14:19:38.047039+00
3	Kerala Medical Association Annual Summit	4	Conference	completed	2025-10-14	Hotel Taj Gateway, Kochi	Kochi	3	2	\N	\N	t	\N	\N	2026-08-18 14:19:38.063666+00	2026-08-18 14:19:38.063666+00
4	Lakshmi & Govind Wedding Celebration	3	Wedding	completed	2026-01-22	The Leela, Kovalam	Thiruvananthapuram	3	2	\N	\N	t	\N	\N	2026-08-18 14:19:38.08564+00	2026-08-18 14:19:38.08564+00
5	Muthoot Finance Leadership Conclave	5	Corporate Event	completed	2026-02-10	Marriott Kochi	Kochi	3	2	\N	\N	t	\N	\N	2026-08-18 14:19:38.105088+00	2026-08-18 14:19:38.105088+00
6	Arun & Meera Wedding	6	Wedding	completed	2026-03-08	Beachfront Resort, Kozhikode	Kozhikode	3	2	\N	\N	t	\N	\N	2026-08-18 14:19:38.126024+00	2026-08-18 14:19:38.126024+00
7	Kerala IT Mission Digital India Summit	7	Government Event	completed	2026-04-20	Mascot Hotel, Trivandrum	Thiruvananthapuram	3	2	\N	\N	t	\N	\N	2026-08-18 14:19:38.15156+00	2026-08-18 14:19:38.15156+00
8	HDFC Bank Kerala Zone Annual Day	8	Corporate Event	completed	2026-05-15	Hotel Renai Cochin	Kochi	3	2	\N	\N	t	\N	\N	2026-08-18 14:19:38.172486+00	2026-08-18 14:19:38.172486+00
9	Sreekanth & Devika Royal Wedding	9	Wedding	completed	2026-06-28	Heritage Palace, Palakkad	Palakkad	3	2	\N	\N	t	\N	\N	2026-08-18 14:19:38.187385+00	2026-08-18 14:19:38.187385+00
10	Kairali Hotels Business Summit 2025	10	Corporate Event	in_progress	2026-08-25	Hotel Kairali Grand, Kochi	Kochi	3	2	\N	\N	t	\N	\N	2026-08-18 14:19:38.207494+00	2026-08-18 14:19:38.207494+00
11	TechCorp Product Launch Event	2	Product Launch	upcoming	2026-09-18	Crowne Plaza Kochi	Kochi	3	2	\N	\N	t	\N	\N	2026-08-18 14:19:38.223812+00	2026-08-18 14:19:38.223812+00
12	Vineeth & Aparna 1st Anniversary Party	1	Private Party	upcoming	2026-12-18	Rooftop Terrace, Le Meridien	Kochi	3	2	\N	\N	t	\N	\N	2026-08-18 14:19:38.235583+00	2026-08-18 14:19:38.235583+00
\.


--
-- Data for Name: leads; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.leads (id, client_id, contact_name, contact_phone, contact_email, source, event_type, expected_value, expected_profit, probability, salesperson_id, date_received, follow_up_date, status, lost_reason, notes, is_demo, created_by, updated_by, created_at, updated_at) FROM stdin;
1	\N	Rajan & Suma	9988776655	\N	Instagram	Wedding	2500000.00	750000.00	75	3	2026-07-01	2026-08-20	proposal_sent	\N	High-value wedding, venue shortlisted	f	\N	\N	2026-08-18 14:19:38.377459+00	2026-08-18 14:19:38.377459+00
2	\N	Infosys BPO - Trivandrum	9988776656	\N	LinkedIn	Corporate Event	3500000.00	980000.00	60	3	2026-07-15	2026-08-22	negotiation	\N	Annual tech summit, 500+ delegates	f	\N	\N	2026-08-18 14:19:38.377459+00	2026-08-18 14:19:38.377459+00
3	\N	Mohammed & Fathima	9988776657	\N	WhatsApp	Wedding	1800000.00	550000.00	85	6	2026-08-01	2026-08-19	requirement_received	\N	January wedding, requirements shared	f	\N	\N	2026-08-18 14:19:38.377459+00	2026-08-18 14:19:38.377459+00
4	\N	Sobha Developers	9988776658	\N	Referral	Product Launch	2200000.00	640000.00	50	3	2026-08-05	2026-08-25	qualified	\N	New residential project launch	f	\N	\N	2026-08-18 14:19:38.377459+00	2026-08-18 14:19:38.377459+00
5	\N	Kerala Tourism Board	9988776659	\N	Government Tender	Government Event	5000000.00	1200000.00	40	3	2026-08-10	2026-09-01	contacted	\N	Tourism festival, competitive bidding	f	\N	\N	2026-08-18 14:19:38.377459+00	2026-08-18 14:19:38.377459+00
6	\N	Anoop & Nisha	9988776660	\N	Google Ads	Wedding	950000.00	290000.00	90	6	2026-08-12	2026-08-18	negotiation	\N	Small intimate wedding, almost confirmed	f	\N	\N	2026-08-18 14:19:38.377459+00	2026-08-18 14:19:38.377459+00
7	\N	State Bank of India - Circle	9988776661	\N	Direct Inquiry	Corporate Event	1800000.00	520000.00	30	3	2026-08-14	2026-09-05	new	\N	New inquiry, initial discussion pending	f	\N	\N	2026-08-18 14:19:38.377459+00	2026-08-18 14:19:38.377459+00
8	\N	Pradeep & Sheeba	9988776662	\N	Referral - Vineeth	Wedding	2800000.00	840000.00	70	3	2026-08-15	2026-08-21	proposal_sent	\N	Referred by Vineeth, looking for similar premium setup	f	\N	\N	2026-08-18 14:19:38.377459+00	2026-08-18 14:19:38.377459+00
9	\N	Wipro Technologies	9988776663	\N	LinkedIn	Corporate Event	4200000.00	1100000.00	25	3	2026-07-20	\N	lost	Budget constraints, went with cheaper vendor	Lost after second round of negotiations	f	\N	\N	2026-08-18 14:19:38.377459+00	2026-08-18 14:19:38.377459+00
10	\N	Amina & Hassan	9988776664	\N	Instagram	Wedding	1500000.00	450000.00	100	6	2026-06-01	\N	won	\N	Booked for November	f	\N	\N	2026-08-18 14:19:38.377459+00	2026-08-18 14:19:38.377459+00
\.


--
-- Data for Name: marketing_channels; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.marketing_channels (id, name, is_active, created_at, updated_at) FROM stdin;
1	Social Media (Instagram/FB)	t	2026-08-18 14:19:37.968356+00	2026-08-18 14:19:37.968356+00
2	Google Ads	t	2026-08-18 14:19:37.972094+00	2026-08-18 14:19:37.972094+00
3	Referral / Word of Mouth	t	2026-08-18 14:19:37.975108+00	2026-08-18 14:19:37.975108+00
4	Event Exhibitions	t	2026-08-18 14:19:37.977491+00	2026-08-18 14:19:37.977491+00
5	WhatsApp Marketing	t	2026-08-18 14:19:37.97994+00	2026-08-18 14:19:37.97994+00
\.


--
-- Data for Name: marketing_spend; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.marketing_spend (id, channel_id, amount, leads_generated, qualified_leads, customers_acquired, revenue_generated, gross_profit_generated, year, month, notes, created_at, updated_at) FROM stdin;
1	1	57637.00	20	10	3	396312.00	138352.00	2026	8	\N	2026-08-18 14:19:37.983333+00	2026-08-18 14:19:37.983333+00
2	2	42032.00	16	8	2	291960.00	84135.00	2026	8	\N	2026-08-18 14:19:37.983333+00	2026-08-18 14:19:37.983333+00
3	3	9450.00	7	6	2	512391.00	154130.00	2026	8	\N	2026-08-18 14:19:37.983333+00	2026-08-18 14:19:37.983333+00
4	1	50823.00	20	8	2	378198.00	115438.00	2026	7	\N	2026-08-18 14:19:37.988137+00	2026-08-18 14:19:37.988137+00
5	2	41404.00	13	8	2	215102.00	79472.00	2026	7	\N	2026-08-18 14:19:37.988137+00	2026-08-18 14:19:37.988137+00
6	3	5665.00	10	4	2	541993.00	169894.00	2026	7	\N	2026-08-18 14:19:37.988137+00	2026-08-18 14:19:37.988137+00
7	1	46348.00	27	8	2	422635.00	143182.00	2026	6	\N	2026-08-18 14:19:37.991289+00	2026-08-18 14:19:37.991289+00
8	2	42627.00	19	6	2	255761.00	67494.00	2026	6	\N	2026-08-18 14:19:37.991289+00	2026-08-18 14:19:37.991289+00
9	3	5131.00	9	6	2	463611.00	150575.00	2026	6	\N	2026-08-18 14:19:37.991289+00	2026-08-18 14:19:37.991289+00
10	1	53812.00	29	10	2	459436.00	114884.00	2026	5	\N	2026-08-18 14:19:37.994483+00	2026-08-18 14:19:37.994483+00
11	2	39583.00	12	8	2	299990.00	66266.00	2026	5	\N	2026-08-18 14:19:37.994483+00	2026-08-18 14:19:37.994483+00
12	3	6174.00	9	6	2	581230.00	141642.00	2026	5	\N	2026-08-18 14:19:37.994483+00	2026-08-18 14:19:37.994483+00
13	1	58496.00	23	9	3	415871.00	126180.00	2026	4	\N	2026-08-18 14:19:37.997657+00	2026-08-18 14:19:37.997657+00
14	2	37562.00	18	6	2	268937.00	79415.00	2026	4	\N	2026-08-18 14:19:37.997657+00	2026-08-18 14:19:37.997657+00
15	3	9515.00	7	7	2	407095.00	149618.00	2026	4	\N	2026-08-18 14:19:37.997657+00	2026-08-18 14:19:37.997657+00
16	1	56224.00	29	12	4	439448.00	145103.00	2026	3	\N	2026-08-18 14:19:38.000126+00	2026-08-18 14:19:38.000126+00
17	2	44133.00	16	8	2	289627.00	70020.00	2026	3	\N	2026-08-18 14:19:38.000126+00	2026-08-18 14:19:38.000126+00
18	3	5267.00	8	4	2	444606.00	133932.00	2026	3	\N	2026-08-18 14:19:38.000126+00	2026-08-18 14:19:38.000126+00
19	1	54497.00	21	9	3	470638.00	119628.00	2026	2	\N	2026-08-18 14:19:38.002869+00	2026-08-18 14:19:38.002869+00
20	2	43263.00	13	5	1	296535.00	76843.00	2026	2	\N	2026-08-18 14:19:38.002869+00	2026-08-18 14:19:38.002869+00
21	3	5774.00	8	4	2	589087.00	180747.00	2026	2	\N	2026-08-18 14:19:38.002869+00	2026-08-18 14:19:38.002869+00
22	1	52065.00	29	13	2	460234.00	113183.00	2026	1	\N	2026-08-18 14:19:38.00541+00	2026-08-18 14:19:38.00541+00
23	2	39858.00	16	5	1	280760.00	86504.00	2026	1	\N	2026-08-18 14:19:38.00541+00	2026-08-18 14:19:38.00541+00
24	3	7422.00	8	7	3	465172.00	150554.00	2026	1	\N	2026-08-18 14:19:38.00541+00	2026-08-18 14:19:38.00541+00
25	1	48092.00	25	13	2	460071.00	136024.00	2025	12	\N	2026-08-18 14:19:38.008464+00	2026-08-18 14:19:38.008464+00
26	2	38942.00	18	5	2	254495.00	82232.00	2025	12	\N	2026-08-18 14:19:38.008464+00	2026-08-18 14:19:38.008464+00
27	3	9081.00	6	4	3	494440.00	149629.00	2025	12	\N	2026-08-18 14:19:38.008464+00	2026-08-18 14:19:38.008464+00
28	1	53567.00	22	10	4	414476.00	131438.00	2025	11	\N	2026-08-18 14:19:38.011622+00	2026-08-18 14:19:38.011622+00
29	2	37305.00	16	6	2	210883.00	75165.00	2025	11	\N	2026-08-18 14:19:38.011622+00	2026-08-18 14:19:38.011622+00
30	3	8553.00	9	7	2	526554.00	154369.00	2025	11	\N	2026-08-18 14:19:38.011622+00	2026-08-18 14:19:38.011622+00
31	1	54083.00	18	13	3	468622.00	107726.00	2025	10	\N	2026-08-18 14:19:38.014164+00	2026-08-18 14:19:38.014164+00
32	2	44990.00	16	7	1	230005.00	71727.00	2025	10	\N	2026-08-18 14:19:38.014164+00	2026-08-18 14:19:38.014164+00
33	3	7815.00	10	4	3	547593.00	176743.00	2025	10	\N	2026-08-18 14:19:38.014164+00	2026-08-18 14:19:38.014164+00
34	1	52979.00	22	11	2	385771.00	123401.00	2025	9	\N	2026-08-18 14:19:38.017056+00	2026-08-18 14:19:38.017056+00
35	2	41456.00	15	8	2	241827.00	70772.00	2025	9	\N	2026-08-18 14:19:38.017056+00	2026-08-18 14:19:38.017056+00
36	3	5443.00	10	5	2	420925.00	146977.00	2025	9	\N	2026-08-18 14:19:38.017056+00	2026-08-18 14:19:38.017056+00
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, user_id, type, title, message, is_read, entity_type, entity_id, created_at) FROM stdin;
1	\N	payment	Payment Received	₹8,00,000 advance received from Kairali Hotels for Business Summit 2025.	f	event	10	2026-08-18 14:19:38.383354+00
2	\N	lead_update	Lead Status Updated	Infosys BPO lead moved to Negotiation stage. Follow-up call scheduled.	f	lead	\N	2026-08-18 14:19:38.383354+00
3	\N	follow_up	Follow-up Due Today	3 lead follow-ups are due today. Review your pipeline.	f	\N	\N	2026-08-18 14:19:38.383354+00
4	\N	milestone	Revenue Milestone	YTD revenue has crossed ₹1 Crore mark. Excellent progress!	t	\N	\N	2026-08-18 14:19:38.383354+00
5	\N	payment	Payment Overdue	Final payment of ₹1,10,000 pending from Kairali Hotels (30 days overdue).	f	event	\N	2026-08-18 14:19:38.383354+00
\.


--
-- Data for Name: operating_expenses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.operating_expenses (id, category, description, amount, gst, year, month, date, reference_number, created_by, created_at, updated_at) FROM stdin;
1	Salaries & Payroll	Salaries & Payroll - 2026/1	633994.00	0.00	2026	1	\N	\N	5	2026-08-18 14:19:38.246521+00	2026-08-18 14:19:38.246521+00
2	Office Rent	Office Rent - 2026/1	55560.00	0.00	2026	1	\N	\N	5	2026-08-18 14:19:38.249389+00	2026-08-18 14:19:38.249389+00
3	Utilities & Internet	Utilities & Internet - 2026/1	17914.00	0.00	2026	1	\N	\N	5	2026-08-18 14:19:38.251529+00	2026-08-18 14:19:38.251529+00
4	Marketing & Advertising	Marketing & Advertising - 2026/1	81893.00	0.00	2026	1	\N	\N	5	2026-08-18 14:19:38.25366+00	2026-08-18 14:19:38.25366+00
5	Travel & Transport	Travel & Transport - 2026/1	25983.00	0.00	2026	1	\N	\N	5	2026-08-18 14:19:38.256434+00	2026-08-18 14:19:38.256434+00
6	Software & Tools	Software & Tools - 2026/1	22351.00	0.00	2026	1	\N	\N	5	2026-08-18 14:19:38.258655+00	2026-08-18 14:19:38.258655+00
7	Miscellaneous	Miscellaneous - 2026/1	14494.00	0.00	2026	1	\N	\N	5	2026-08-18 14:19:38.261036+00	2026-08-18 14:19:38.261036+00
8	Salaries & Payroll	Salaries & Payroll - 2026/2	628552.00	0.00	2026	2	\N	\N	5	2026-08-18 14:19:38.263346+00	2026-08-18 14:19:38.263346+00
9	Office Rent	Office Rent - 2026/2	56915.00	0.00	2026	2	\N	\N	5	2026-08-18 14:19:38.26604+00	2026-08-18 14:19:38.26604+00
10	Utilities & Internet	Utilities & Internet - 2026/2	18108.00	0.00	2026	2	\N	\N	5	2026-08-18 14:19:38.269085+00	2026-08-18 14:19:38.269085+00
11	Marketing & Advertising	Marketing & Advertising - 2026/2	80422.00	0.00	2026	2	\N	\N	5	2026-08-18 14:19:38.271556+00	2026-08-18 14:19:38.271556+00
12	Travel & Transport	Travel & Transport - 2026/2	23605.00	0.00	2026	2	\N	\N	5	2026-08-18 14:19:38.273865+00	2026-08-18 14:19:38.273865+00
13	Software & Tools	Software & Tools - 2026/2	20543.00	0.00	2026	2	\N	\N	5	2026-08-18 14:19:38.276158+00	2026-08-18 14:19:38.276158+00
14	Miscellaneous	Miscellaneous - 2026/2	14362.00	0.00	2026	2	\N	\N	5	2026-08-18 14:19:38.278811+00	2026-08-18 14:19:38.278811+00
15	Salaries & Payroll	Salaries & Payroll - 2026/3	539718.00	0.00	2026	3	\N	\N	5	2026-08-18 14:19:38.281281+00	2026-08-18 14:19:38.281281+00
16	Office Rent	Office Rent - 2026/3	54420.00	0.00	2026	3	\N	\N	5	2026-08-18 14:19:38.28356+00	2026-08-18 14:19:38.28356+00
17	Utilities & Internet	Utilities & Internet - 2026/3	18627.00	0.00	2026	3	\N	\N	5	2026-08-18 14:19:38.285954+00	2026-08-18 14:19:38.285954+00
18	Marketing & Advertising	Marketing & Advertising - 2026/3	87325.00	0.00	2026	3	\N	\N	5	2026-08-18 14:19:38.288155+00	2026-08-18 14:19:38.288155+00
19	Travel & Transport	Travel & Transport - 2026/3	23277.00	0.00	2026	3	\N	\N	5	2026-08-18 14:19:38.290206+00	2026-08-18 14:19:38.290206+00
20	Software & Tools	Software & Tools - 2026/3	20424.00	0.00	2026	3	\N	\N	5	2026-08-18 14:19:38.294132+00	2026-08-18 14:19:38.294132+00
21	Miscellaneous	Miscellaneous - 2026/3	15464.00	0.00	2026	3	\N	\N	5	2026-08-18 14:19:38.296414+00	2026-08-18 14:19:38.296414+00
22	Salaries & Payroll	Salaries & Payroll - 2026/4	628991.00	0.00	2026	4	\N	\N	5	2026-08-18 14:19:38.298589+00	2026-08-18 14:19:38.298589+00
23	Office Rent	Office Rent - 2026/4	57741.00	0.00	2026	4	\N	\N	5	2026-08-18 14:19:38.300841+00	2026-08-18 14:19:38.300841+00
24	Utilities & Internet	Utilities & Internet - 2026/4	18442.00	0.00	2026	4	\N	\N	5	2026-08-18 14:19:38.303401+00	2026-08-18 14:19:38.303401+00
25	Marketing & Advertising	Marketing & Advertising - 2026/4	87186.00	0.00	2026	4	\N	\N	5	2026-08-18 14:19:38.307257+00	2026-08-18 14:19:38.307257+00
26	Travel & Transport	Travel & Transport - 2026/4	23937.00	0.00	2026	4	\N	\N	5	2026-08-18 14:19:38.309429+00	2026-08-18 14:19:38.309429+00
27	Software & Tools	Software & Tools - 2026/4	20740.00	0.00	2026	4	\N	\N	5	2026-08-18 14:19:38.311414+00	2026-08-18 14:19:38.311414+00
28	Miscellaneous	Miscellaneous - 2026/4	16430.00	0.00	2026	4	\N	\N	5	2026-08-18 14:19:38.313472+00	2026-08-18 14:19:38.313472+00
29	Salaries & Payroll	Salaries & Payroll - 2026/5	588605.00	0.00	2026	5	\N	\N	5	2026-08-18 14:19:38.315609+00	2026-08-18 14:19:38.315609+00
30	Office Rent	Office Rent - 2026/5	52433.00	0.00	2026	5	\N	\N	5	2026-08-18 14:19:38.318058+00	2026-08-18 14:19:38.318058+00
31	Utilities & Internet	Utilities & Internet - 2026/5	17172.00	0.00	2026	5	\N	\N	5	2026-08-18 14:19:38.320299+00	2026-08-18 14:19:38.320299+00
32	Marketing & Advertising	Marketing & Advertising - 2026/5	92823.00	0.00	2026	5	\N	\N	5	2026-08-18 14:19:38.32269+00	2026-08-18 14:19:38.32269+00
33	Travel & Transport	Travel & Transport - 2026/5	26758.00	0.00	2026	5	\N	\N	5	2026-08-18 14:19:38.324909+00	2026-08-18 14:19:38.324909+00
34	Software & Tools	Software & Tools - 2026/5	22480.00	0.00	2026	5	\N	\N	5	2026-08-18 14:19:38.326924+00	2026-08-18 14:19:38.326924+00
35	Miscellaneous	Miscellaneous - 2026/5	15922.00	0.00	2026	5	\N	\N	5	2026-08-18 14:19:38.329028+00	2026-08-18 14:19:38.329028+00
36	Salaries & Payroll	Salaries & Payroll - 2026/6	561131.00	0.00	2026	6	\N	\N	5	2026-08-18 14:19:38.331342+00	2026-08-18 14:19:38.331342+00
37	Office Rent	Office Rent - 2026/6	59278.00	0.00	2026	6	\N	\N	5	2026-08-18 14:19:38.333489+00	2026-08-18 14:19:38.333489+00
38	Utilities & Internet	Utilities & Internet - 2026/6	17101.00	0.00	2026	6	\N	\N	5	2026-08-18 14:19:38.33555+00	2026-08-18 14:19:38.33555+00
39	Marketing & Advertising	Marketing & Advertising - 2026/6	82175.00	0.00	2026	6	\N	\N	5	2026-08-18 14:19:38.337654+00	2026-08-18 14:19:38.337654+00
40	Travel & Transport	Travel & Transport - 2026/6	24837.00	0.00	2026	6	\N	\N	5	2026-08-18 14:19:38.339726+00	2026-08-18 14:19:38.339726+00
41	Software & Tools	Software & Tools - 2026/6	22883.00	0.00	2026	6	\N	\N	5	2026-08-18 14:19:38.341939+00	2026-08-18 14:19:38.341939+00
42	Miscellaneous	Miscellaneous - 2026/6	13841.00	0.00	2026	6	\N	\N	5	2026-08-18 14:19:38.344371+00	2026-08-18 14:19:38.344371+00
43	Salaries & Payroll	Salaries & Payroll - 2026/7	561839.00	0.00	2026	7	\N	\N	5	2026-08-18 14:19:38.346832+00	2026-08-18 14:19:38.346832+00
44	Office Rent	Office Rent - 2026/7	56505.00	0.00	2026	7	\N	\N	5	2026-08-18 14:19:38.348797+00	2026-08-18 14:19:38.348797+00
45	Utilities & Internet	Utilities & Internet - 2026/7	18232.00	0.00	2026	7	\N	\N	5	2026-08-18 14:19:38.350951+00	2026-08-18 14:19:38.350951+00
46	Marketing & Advertising	Marketing & Advertising - 2026/7	80873.00	0.00	2026	7	\N	\N	5	2026-08-18 14:19:38.352988+00	2026-08-18 14:19:38.352988+00
47	Travel & Transport	Travel & Transport - 2026/7	24449.00	0.00	2026	7	\N	\N	5	2026-08-18 14:19:38.355408+00	2026-08-18 14:19:38.355408+00
48	Software & Tools	Software & Tools - 2026/7	21703.00	0.00	2026	7	\N	\N	5	2026-08-18 14:19:38.35762+00	2026-08-18 14:19:38.35762+00
49	Miscellaneous	Miscellaneous - 2026/7	15351.00	0.00	2026	7	\N	\N	5	2026-08-18 14:19:38.359818+00	2026-08-18 14:19:38.359818+00
50	Salaries & Payroll	Salaries & Payroll - 2026/8	569754.00	0.00	2026	8	\N	\N	5	2026-08-18 14:19:38.36208+00	2026-08-18 14:19:38.36208+00
51	Office Rent	Office Rent - 2026/8	59478.00	0.00	2026	8	\N	\N	5	2026-08-18 14:19:38.364109+00	2026-08-18 14:19:38.364109+00
52	Utilities & Internet	Utilities & Internet - 2026/8	18045.00	0.00	2026	8	\N	\N	5	2026-08-18 14:19:38.366267+00	2026-08-18 14:19:38.366267+00
53	Marketing & Advertising	Marketing & Advertising - 2026/8	79869.00	0.00	2026	8	\N	\N	5	2026-08-18 14:19:38.368567+00	2026-08-18 14:19:38.368567+00
54	Travel & Transport	Travel & Transport - 2026/8	27289.00	0.00	2026	8	\N	\N	5	2026-08-18 14:19:38.370796+00	2026-08-18 14:19:38.370796+00
55	Software & Tools	Software & Tools - 2026/8	20767.00	0.00	2026	8	\N	\N	5	2026-08-18 14:19:38.372776+00	2026-08-18 14:19:38.372776+00
56	Miscellaneous	Miscellaneous - 2026/8	15612.00	0.00	2026	8	\N	\N	5	2026-08-18 14:19:38.374886+00	2026-08-18 14:19:38.374886+00
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sessions (sid, sess, expire) FROM stdin;
fe485c64ba666454eed729a7ecbd183730471ebd3243aa26d4da96e6107ee89d	{"user": {"id": "63163971", "email": "auronproductions@gmail.com", "lastName": null, "firstName": "Auronproductions", "profileImageUrl": "https://lh3.googleusercontent.com/a/ACg8ocIr-NrekrUlJXkMZZ-3Nx9v4cIJekTen3zZYqRyPjtl6XXfPzA=s96-c"}, "expires_at": 1787069978, "access_token": "FmbvaFgbHbt_w-1f20Rkq2JiCTe32q-PpTFOkDxmr_r", "refresh_token": "jqTOKrLfyPIaaygwBQsyk138BbmNj70w8RO3IJCGWsb"}	2026-08-25 15:19:39.537
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, first_name, last_name, profile_image_url, created_at, updated_at) FROM stdin;
63000024	dartmedia9@gmail.com	Ananthakrishnan	P A	https://lh3.googleusercontent.com/a/ACg8ocIIxLF-lblOsQP8Z-2oQeL25uDYBIlyi7jqctVttl_G5xt1MZCV=s96-c	2026-08-18 14:23:46.839521+00	2026-08-18 14:23:46.839521+00
63163971	auronproductions@gmail.com	Auronproductions	\N	https://lh3.googleusercontent.com/a/ACg8ocIr-NrekrUlJXkMZZ-3Nx9v4cIJekTen3zZYqRyPjtl6XXfPzA=s96-c	2026-08-18 15:19:39.496602+00	2026-08-18 15:19:39.496602+00
\.


--
-- Data for Name: valuation_scenarios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.valuation_scenarios (id, name, scenario_type, target_valuation, current_revenue, current_ebitda, current_net_profit, revenue_growth_rate, ebitda_margin, revenue_multiple, ebitda_multiple, notes, is_default, created_at, updated_at) FROM stdin;
1	Conservative	conservative	900000000.00	130000000.00	13000000.00	\N	0.2000	0.1000	3.00	8.00	Assumes slower growth, tighter margins	f	2026-08-18 14:19:38.380693+00	2026-08-18 14:19:38.380693+00
2	Base Case	base	900000000.00	130000000.00	19500000.00	\N	0.3000	0.1500	3.50	10.00	Most likely scenario with sustained growth	t	2026-08-18 14:19:38.380693+00	2026-08-18 14:19:38.380693+00
3	Aggressive	aggressive	900000000.00	130000000.00	26000000.00	\N	0.4500	0.2000	4.50	12.00	Geographic expansion, enterprise contracts	f	2026-08-18 14:19:38.380693+00	2026-08-18 14:19:38.380693+00
\.


--
-- Data for Name: vendors; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vendors (id, name, category, contact_person, phone, email, location, payment_terms, rating, notes, is_demo, created_by, updated_by, created_at, updated_at) FROM stdin;
1	Kerala Sound & Light	AV & Lighting	Manoj Shetty	9876543210	manoj@kslight.com	Kochi	Net 30	5	\N	f	\N	\N	2026-08-18 14:19:37.94605+00	2026-08-18 14:19:37.94605+00
2	Bloom Florists	Decor & Florals	Rekha Thomas	9876543211	\N	Thrissur	50% advance	5	\N	f	\N	\N	2026-08-18 14:19:37.949857+00	2026-08-18 14:19:37.949857+00
3	Spice Garden Catering	Catering	Ahmed Faiz	9876543212	\N	Kozhikode	Net 15	4	\N	f	\N	\N	2026-08-18 14:19:37.953413+00	2026-08-18 14:19:37.953413+00
4	Frame Perfect Photography	Photography & Video	Arun Babu	9876543213	\N	Kochi	Full payment before event	5	\N	f	\N	\N	2026-08-18 14:19:37.956476+00	2026-08-18 14:19:37.956476+00
5	Carnival Tent House	Tent & Furniture	Suresh Nambiar	9876543214	\N	Palakkad	Net 30	4	\N	f	\N	\N	2026-08-18 14:19:37.959552+00	2026-08-18 14:19:37.959552+00
6	Elite Transport Co.	Logistics	Deepak Pillai	9876543215	\N	Thiruvananthapuram	Net 15	4	\N	f	\N	\N	2026-08-18 14:19:37.961833+00	2026-08-18 14:19:37.961833+00
\.


--
-- Name: assets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.assets_id_seq', 7, true);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 3, true);


--
-- Name: clients_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.clients_id_seq', 10, true);


--
-- Name: company_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.company_settings_id_seq', 1, true);


--
-- Name: employees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.employees_id_seq', 6, true);


--
-- Name: event_costs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.event_costs_id_seq', 55, true);


--
-- Name: event_revenue_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.event_revenue_id_seq', 12, true);


--
-- Name: events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.events_id_seq', 12, true);


--
-- Name: leads_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.leads_id_seq', 10, true);


--
-- Name: marketing_channels_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.marketing_channels_id_seq', 5, true);


--
-- Name: marketing_spend_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.marketing_spend_id_seq', 36, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notifications_id_seq', 5, true);


--
-- Name: operating_expenses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.operating_expenses_id_seq', 56, true);


--
-- Name: valuation_scenarios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.valuation_scenarios_id_seq', 3, true);


--
-- Name: vendors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.vendors_id_seq', 6, true);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: event_costs event_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_costs
    ADD CONSTRAINT event_costs_pkey PRIMARY KEY (id);


--
-- Name: event_revenue event_revenue_event_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_revenue
    ADD CONSTRAINT event_revenue_event_id_unique UNIQUE (event_id);


--
-- Name: event_revenue event_revenue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_revenue
    ADD CONSTRAINT event_revenue_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: marketing_channels marketing_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketing_channels
    ADD CONSTRAINT marketing_channels_pkey PRIMARY KEY (id);


--
-- Name: marketing_spend marketing_spend_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketing_spend
    ADD CONSTRAINT marketing_spend_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: operating_expenses operating_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.operating_expenses
    ADD CONSTRAINT operating_expenses_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (sid);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: valuation_scenarios valuation_scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.valuation_scenarios
    ADD CONSTRAINT valuation_scenarios_pkey PRIMARY KEY (id);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_session_expire" ON public.sessions USING btree (expire);


--
-- Name: event_costs event_costs_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_costs
    ADD CONSTRAINT event_costs_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_revenue event_revenue_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_revenue
    ADD CONSTRAINT event_revenue_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: events events_client_id_clients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_client_id_clients_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: marketing_spend marketing_spend_channel_id_marketing_channels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketing_spend
    ADD CONSTRAINT marketing_spend_channel_id_marketing_channels_id_fk FOREIGN KEY (channel_id) REFERENCES public.marketing_channels(id);


--
-- PostgreSQL database dump complete
--

\unrestrict eWytpV1KHNguy7Gx96YKNSxmwd7YPTy4F0VaO6Aegf5s2KhjlmxTaxKJnqcaMH1

