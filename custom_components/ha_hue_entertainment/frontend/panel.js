//#region node_modules/@lit/reactive-element/css-tag.js
var e = globalThis, t = e.ShadowRoot && (e.ShadyCSS === void 0 || e.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, n = Symbol(), r = /* @__PURE__ */ new WeakMap(), i = class {
	constructor(e, t, r) {
		if (this._$cssResult$ = !0, r !== n) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
		this.cssText = e, this.t = t;
	}
	get styleSheet() {
		let e = this.o, n = this.t;
		if (t && e === void 0) {
			let t = n !== void 0 && n.length === 1;
			t && (e = r.get(n)), e === void 0 && ((this.o = e = new CSSStyleSheet()).replaceSync(this.cssText), t && r.set(n, e));
		}
		return e;
	}
	toString() {
		return this.cssText;
	}
}, a = (e) => new i(typeof e == "string" ? e : e + "", void 0, n), o = (e, ...t) => new i(e.length === 1 ? e[0] : t.reduce((t, n, r) => t + ((e) => {
	if (!0 === e._$cssResult$) return e.cssText;
	if (typeof e == "number") return e;
	throw Error("Value passed to 'css' function must be a 'css' function result: " + e + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
})(n) + e[r + 1], e[0]), e, n), s = (n, r) => {
	if (t) n.adoptedStyleSheets = r.map((e) => e instanceof CSSStyleSheet ? e : e.styleSheet);
	else for (let t of r) {
		let r = document.createElement("style"), i = e.litNonce;
		i !== void 0 && r.setAttribute("nonce", i), r.textContent = t.cssText, n.appendChild(r);
	}
}, c = t ? (e) => e : (e) => e instanceof CSSStyleSheet ? ((e) => {
	let t = "";
	for (let n of e.cssRules) t += n.cssText;
	return a(t);
})(e) : e, { is: l, defineProperty: u, getOwnPropertyDescriptor: d, getOwnPropertyNames: ee, getOwnPropertySymbols: te, getPrototypeOf: ne } = Object, f = globalThis, p = f.trustedTypes, re = p ? p.emptyScript : "", ie = f.reactiveElementPolyfillSupport, m = (e, t) => e, h = {
	toAttribute(e, t) {
		switch (t) {
			case Boolean:
				e = e ? re : null;
				break;
			case Object:
			case Array: e = e == null ? e : JSON.stringify(e);
		}
		return e;
	},
	fromAttribute(e, t) {
		let n = e;
		switch (t) {
			case Boolean:
				n = e !== null;
				break;
			case Number:
				n = e === null ? null : Number(e);
				break;
			case Object:
			case Array: try {
				n = JSON.parse(e);
			} catch {
				n = null;
			}
		}
		return n;
	}
}, g = (e, t) => !l(e, t), _ = {
	attribute: !0,
	type: String,
	converter: h,
	reflect: !1,
	useDefault: !1,
	hasChanged: g
};
Symbol.metadata ??= Symbol("metadata"), f.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var v = class extends HTMLElement {
	static addInitializer(e) {
		this._$Ei(), (this.l ??= []).push(e);
	}
	static get observedAttributes() {
		return this.finalize(), this._$Eh && [...this._$Eh.keys()];
	}
	static createProperty(e, t = _) {
		if (t.state && (t.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(e) && ((t = Object.create(t)).wrapped = !0), this.elementProperties.set(e, t), !t.noAccessor) {
			let n = Symbol(), r = this.getPropertyDescriptor(e, n, t);
			r !== void 0 && u(this.prototype, e, r);
		}
	}
	static getPropertyDescriptor(e, t, n) {
		let { get: r, set: i } = d(this.prototype, e) ?? {
			get() {
				return this[t];
			},
			set(e) {
				this[t] = e;
			}
		};
		return {
			get: r,
			set(t) {
				let a = r?.call(this);
				i?.call(this, t), this.requestUpdate(e, a, n);
			},
			configurable: !0,
			enumerable: !0
		};
	}
	static getPropertyOptions(e) {
		return this.elementProperties.get(e) ?? _;
	}
	static _$Ei() {
		if (this.hasOwnProperty(m("elementProperties"))) return;
		let e = ne(this);
		e.finalize(), e.l !== void 0 && (this.l = [...e.l]), this.elementProperties = new Map(e.elementProperties);
	}
	static finalize() {
		if (this.hasOwnProperty(m("finalized"))) return;
		if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(m("properties"))) {
			let e = this.properties, t = [...ee(e), ...te(e)];
			for (let n of t) this.createProperty(n, e[n]);
		}
		let e = this[Symbol.metadata];
		if (e !== null) {
			let t = litPropertyMetadata.get(e);
			if (t !== void 0) for (let [e, n] of t) this.elementProperties.set(e, n);
		}
		this._$Eh = /* @__PURE__ */ new Map();
		for (let [e, t] of this.elementProperties) {
			let n = this._$Eu(e, t);
			n !== void 0 && this._$Eh.set(n, e);
		}
		this.elementStyles = this.finalizeStyles(this.styles);
	}
	static finalizeStyles(e) {
		let t = [];
		if (Array.isArray(e)) {
			let n = new Set(e.flat(1 / 0).reverse());
			for (let e of n) t.unshift(c(e));
		} else e !== void 0 && t.push(c(e));
		return t;
	}
	static _$Eu(e, t) {
		let n = t.attribute;
		return !1 === n ? void 0 : typeof n == "string" ? n : typeof e == "string" ? e.toLowerCase() : void 0;
	}
	constructor() {
		super(), this._$Ep = void 0, this.isUpdatePending = !1, this.hasUpdated = !1, this._$Em = null, this._$Ev();
	}
	_$Ev() {
		this._$ES = new Promise((e) => this.enableUpdating = e), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((e) => e(this));
	}
	addController(e) {
		(this._$EO ??= /* @__PURE__ */ new Set()).add(e), this.renderRoot !== void 0 && this.isConnected && e.hostConnected?.();
	}
	removeController(e) {
		this._$EO?.delete(e);
	}
	_$E_() {
		let e = /* @__PURE__ */ new Map(), t = this.constructor.elementProperties;
		for (let n of t.keys()) this.hasOwnProperty(n) && (e.set(n, this[n]), delete this[n]);
		e.size > 0 && (this._$Ep = e);
	}
	createRenderRoot() {
		let e = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
		return s(e, this.constructor.elementStyles), e;
	}
	connectedCallback() {
		this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(!0), this._$EO?.forEach((e) => e.hostConnected?.());
	}
	enableUpdating(e) {}
	disconnectedCallback() {
		this._$EO?.forEach((e) => e.hostDisconnected?.());
	}
	attributeChangedCallback(e, t, n) {
		this._$AK(e, n);
	}
	_$ET(e, t) {
		let n = this.constructor.elementProperties.get(e), r = this.constructor._$Eu(e, n);
		if (r !== void 0 && !0 === n.reflect) {
			let i = (n.converter?.toAttribute === void 0 ? h : n.converter).toAttribute(t, n.type);
			this._$Em = e, i == null ? this.removeAttribute(r) : this.setAttribute(r, i), this._$Em = null;
		}
	}
	_$AK(e, t) {
		let n = this.constructor, r = n._$Eh.get(e);
		if (r !== void 0 && this._$Em !== r) {
			let e = n.getPropertyOptions(r), i = typeof e.converter == "function" ? { fromAttribute: e.converter } : e.converter?.fromAttribute === void 0 ? h : e.converter;
			this._$Em = r;
			let a = i.fromAttribute(t, e.type);
			this[r] = a ?? this._$Ej?.get(r) ?? a, this._$Em = null;
		}
	}
	requestUpdate(e, t, n, r = !1, i) {
		if (e !== void 0) {
			let a = this.constructor;
			if (!1 === r && (i = this[e]), n ??= a.getPropertyOptions(e), !((n.hasChanged ?? g)(i, t) || n.useDefault && n.reflect && i === this._$Ej?.get(e) && !this.hasAttribute(a._$Eu(e, n)))) return;
			this.C(e, t, n);
		}
		!1 === this.isUpdatePending && (this._$ES = this._$EP());
	}
	C(e, t, { useDefault: n, reflect: r, wrapped: i }, a) {
		n && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(e) && (this._$Ej.set(e, a ?? t ?? this[e]), !0 !== i || a !== void 0) || (this._$AL.has(e) || (this.hasUpdated || n || (t = void 0), this._$AL.set(e, t)), !0 === r && this._$Em !== e && (this._$Eq ??= /* @__PURE__ */ new Set()).add(e));
	}
	async _$EP() {
		this.isUpdatePending = !0;
		try {
			await this._$ES;
		} catch (e) {
			Promise.reject(e);
		}
		let e = this.scheduleUpdate();
		return e != null && await e, !this.isUpdatePending;
	}
	scheduleUpdate() {
		return this.performUpdate();
	}
	performUpdate() {
		if (!this.isUpdatePending) return;
		if (!this.hasUpdated) {
			if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
				for (let [e, t] of this._$Ep) this[e] = t;
				this._$Ep = void 0;
			}
			let e = this.constructor.elementProperties;
			if (e.size > 0) for (let [t, n] of e) {
				let { wrapped: e } = n, r = this[t];
				!0 !== e || this._$AL.has(t) || r === void 0 || this.C(t, void 0, n, r);
			}
		}
		let e = !1, t = this._$AL;
		try {
			e = this.shouldUpdate(t), e ? (this.willUpdate(t), this._$EO?.forEach((e) => e.hostUpdate?.()), this.update(t)) : this._$EM();
		} catch (t) {
			throw e = !1, this._$EM(), t;
		}
		e && this._$AE(t);
	}
	willUpdate(e) {}
	_$AE(e) {
		this._$EO?.forEach((e) => e.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = !0, this.firstUpdated(e)), this.updated(e);
	}
	_$EM() {
		this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = !1;
	}
	get updateComplete() {
		return this.getUpdateComplete();
	}
	getUpdateComplete() {
		return this._$ES;
	}
	shouldUpdate(e) {
		return !0;
	}
	update(e) {
		this._$Eq &&= this._$Eq.forEach((e) => this._$ET(e, this[e])), this._$EM();
	}
	updated(e) {}
	firstUpdated(e) {}
};
v.elementStyles = [], v.shadowRootOptions = { mode: "open" }, v[m("elementProperties")] = /* @__PURE__ */ new Map(), v[m("finalized")] = /* @__PURE__ */ new Map(), ie?.({ ReactiveElement: v }), (f.reactiveElementVersions ??= []).push("2.1.2");
//#endregion
//#region node_modules/lit-html/lit-html.js
var y = globalThis, b = (e) => e, x = y.trustedTypes, S = x ? x.createPolicy("lit-html", { createHTML: (e) => e }) : void 0, C = "$lit$", w = `lit$${Math.random().toFixed(9).slice(2)}$`, T = "?" + w, ae = `<${T}>`, E = document, D = () => E.createComment(""), O = (e) => e === null || typeof e != "object" && typeof e != "function", k = Array.isArray, oe = (e) => k(e) || typeof e?.[Symbol.iterator] == "function", A = "[ 	\n\f\r]", j = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, se = /-->/g, ce = />/g, M = RegExp(`>|${A}(?:([^\\s"'>=/]+)(${A}*=${A}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`, "g"), le = /'/g, ue = /"/g, N = /^(?:script|style|textarea|title)$/i, P = (e) => (t, ...n) => ({
	_$litType$: e,
	strings: t,
	values: n
}), F = P(1), I = P(2), L = Symbol.for("lit-noChange"), R = Symbol.for("lit-nothing"), z = /* @__PURE__ */ new WeakMap(), B = E.createTreeWalker(E, 129);
function V(e, t) {
	if (!k(e) || !e.hasOwnProperty("raw")) throw Error("invalid template strings array");
	return S === void 0 ? t : S.createHTML(t);
}
var de = (e, t) => {
	let n = e.length - 1, r = [], i, a = t === 2 ? "<svg>" : t === 3 ? "<math>" : "", o = j;
	for (let t = 0; t < n; t++) {
		let n = e[t], s, c, l = -1, u = 0;
		for (; u < n.length && (o.lastIndex = u, c = o.exec(n), c !== null);) u = o.lastIndex, o === j ? c[1] === "!--" ? o = se : c[1] === void 0 ? c[2] === void 0 ? c[3] !== void 0 && (o = M) : (N.test(c[2]) && (i = RegExp("</" + c[2], "g")), o = M) : o = ce : o === M ? c[0] === ">" ? (o = i ?? j, l = -1) : c[1] === void 0 ? l = -2 : (l = o.lastIndex - c[2].length, s = c[1], o = c[3] === void 0 ? M : c[3] === "\"" ? ue : le) : o === ue || o === le ? o = M : o === se || o === ce ? o = j : (o = M, i = void 0);
		let d = o === M && e[t + 1].startsWith("/>") ? " " : "";
		a += o === j ? n + ae : l >= 0 ? (r.push(s), n.slice(0, l) + C + n.slice(l) + w + d) : n + w + (l === -2 ? t : d);
	}
	return [V(e, a + (e[n] || "<?>") + (t === 2 ? "</svg>" : t === 3 ? "</math>" : "")), r];
}, H = class e {
	constructor({ strings: t, _$litType$: n }, r) {
		let i;
		this.parts = [];
		let a = 0, o = 0, s = t.length - 1, c = this.parts, [l, u] = de(t, n);
		if (this.el = e.createElement(l, r), B.currentNode = this.el.content, n === 2 || n === 3) {
			let e = this.el.content.firstChild;
			e.replaceWith(...e.childNodes);
		}
		for (; (i = B.nextNode()) !== null && c.length < s;) {
			if (i.nodeType === 1) {
				if (i.hasAttributes()) for (let e of i.getAttributeNames()) if (e.endsWith(C)) {
					let t = u[o++], n = i.getAttribute(e).split(w), r = /([.?@])?(.*)/.exec(t);
					c.push({
						type: 1,
						index: a,
						name: r[2],
						strings: n,
						ctor: r[1] === "." ? pe : r[1] === "?" ? me : r[1] === "@" ? he : G
					}), i.removeAttribute(e);
				} else e.startsWith(w) && (c.push({
					type: 6,
					index: a
				}), i.removeAttribute(e));
				if (N.test(i.tagName)) {
					let e = i.textContent.split(w), t = e.length - 1;
					if (t > 0) {
						i.textContent = x ? x.emptyScript : "";
						for (let n = 0; n < t; n++) i.append(e[n], D()), B.nextNode(), c.push({
							type: 2,
							index: ++a
						});
						i.append(e[t], D());
					}
				}
			} else if (i.nodeType === 8) {
				if (i.data === T) c.push({
					type: 2,
					index: a
				});
				else {
					let e = -1;
					for (; (e = i.data.indexOf(w, e + 1)) !== -1;) c.push({
						type: 7,
						index: a
					}), e += w.length - 1;
				}
			}
			a++;
		}
	}
	static createElement(e, t) {
		let n = E.createElement("template");
		return n.innerHTML = e, n;
	}
};
function U(e, t, n = e, r) {
	if (t === L) return t;
	let i = r === void 0 ? n._$Cl : n._$Co?.[r], a = O(t) ? void 0 : t._$litDirective$;
	return i?.constructor !== a && (i?._$AO?.(!1), a === void 0 ? i = void 0 : (i = new a(e), i._$AT(e, n, r)), r === void 0 ? n._$Cl = i : (n._$Co ??= [])[r] = i), i !== void 0 && (t = U(e, i._$AS(e, t.values), i, r)), t;
}
var fe = class {
	constructor(e, t) {
		this._$AV = [], this._$AN = void 0, this._$AD = e, this._$AM = t;
	}
	get parentNode() {
		return this._$AM.parentNode;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	u(e) {
		let { el: { content: t }, parts: n } = this._$AD, r = (e?.creationScope ?? E).importNode(t, !0);
		B.currentNode = r;
		let i = B.nextNode(), a = 0, o = 0, s = n[0];
		for (; s !== void 0;) {
			if (a === s.index) {
				let t;
				s.type === 2 ? t = new W(i, i.nextSibling, this, e) : s.type === 1 ? t = new s.ctor(i, s.name, s.strings, this, e) : s.type === 6 && (t = new ge(i, this, e)), this._$AV.push(t), s = n[++o];
			}
			a !== s?.index && (i = B.nextNode(), a++);
		}
		return B.currentNode = E, r;
	}
	p(e) {
		let t = 0;
		for (let n of this._$AV) n !== void 0 && (n.strings === void 0 ? n._$AI(e[t]) : (n._$AI(e, n, t), t += n.strings.length - 2)), t++;
	}
}, W = class e {
	get _$AU() {
		return this._$AM?._$AU ?? this._$Cv;
	}
	constructor(e, t, n, r) {
		this.type = 2, this._$AH = R, this._$AN = void 0, this._$AA = e, this._$AB = t, this._$AM = n, this.options = r, this._$Cv = r?.isConnected ?? !0;
	}
	get parentNode() {
		let e = this._$AA.parentNode, t = this._$AM;
		return t !== void 0 && e?.nodeType === 11 && (e = t.parentNode), e;
	}
	get startNode() {
		return this._$AA;
	}
	get endNode() {
		return this._$AB;
	}
	_$AI(e, t = this) {
		e = U(this, e, t), O(e) ? e === R || e == null || e === "" ? (this._$AH !== R && this._$AR(), this._$AH = R) : e !== this._$AH && e !== L && this._(e) : e._$litType$ === void 0 ? e.nodeType === void 0 ? oe(e) ? this.k(e) : this._(e) : this.T(e) : this.$(e);
	}
	O(e) {
		return this._$AA.parentNode.insertBefore(e, this._$AB);
	}
	T(e) {
		this._$AH !== e && (this._$AR(), this._$AH = this.O(e));
	}
	_(e) {
		this._$AH !== R && O(this._$AH) ? this._$AA.nextSibling.data = e : this.T(E.createTextNode(e)), this._$AH = e;
	}
	$(e) {
		let { values: t, _$litType$: n } = e, r = typeof n == "number" ? this._$AC(e) : (n.el === void 0 && (n.el = H.createElement(V(n.h, n.h[0]), this.options)), n);
		if (this._$AH?._$AD === r) this._$AH.p(t);
		else {
			let e = new fe(r, this), n = e.u(this.options);
			e.p(t), this.T(n), this._$AH = e;
		}
	}
	_$AC(e) {
		let t = z.get(e.strings);
		return t === void 0 && z.set(e.strings, t = new H(e)), t;
	}
	k(t) {
		k(this._$AH) || (this._$AH = [], this._$AR());
		let n = this._$AH, r, i = 0;
		for (let a of t) i === n.length ? n.push(r = new e(this.O(D()), this.O(D()), this, this.options)) : r = n[i], r._$AI(a), i++;
		i < n.length && (this._$AR(r && r._$AB.nextSibling, i), n.length = i);
	}
	_$AR(e = this._$AA.nextSibling, t) {
		for (this._$AP?.(!1, !0, t); e !== this._$AB;) {
			let t = b(e).nextSibling;
			b(e).remove(), e = t;
		}
	}
	setConnected(e) {
		this._$AM === void 0 && (this._$Cv = e, this._$AP?.(e));
	}
}, G = class {
	get tagName() {
		return this.element.tagName;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	constructor(e, t, n, r, i) {
		this.type = 1, this._$AH = R, this._$AN = void 0, this.element = e, this.name = t, this._$AM = r, this.options = i, n.length > 2 || n[0] !== "" || n[1] !== "" ? (this._$AH = Array(n.length - 1).fill(/* @__PURE__ */ new String()), this.strings = n) : this._$AH = R;
	}
	_$AI(e, t = this, n, r) {
		let i = this.strings, a = !1;
		if (i === void 0) e = U(this, e, t, 0), a = !O(e) || e !== this._$AH && e !== L, a && (this._$AH = e);
		else {
			let r = e, o, s;
			for (e = i[0], o = 0; o < i.length - 1; o++) s = U(this, r[n + o], t, o), s === L && (s = this._$AH[o]), a ||= !O(s) || s !== this._$AH[o], s === R ? e = R : e !== R && (e += (s ?? "") + i[o + 1]), this._$AH[o] = s;
		}
		a && !r && this.j(e);
	}
	j(e) {
		e === R ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, e ?? "");
	}
}, pe = class extends G {
	constructor() {
		super(...arguments), this.type = 3;
	}
	j(e) {
		this.element[this.name] = e === R ? void 0 : e;
	}
}, me = class extends G {
	constructor() {
		super(...arguments), this.type = 4;
	}
	j(e) {
		this.element.toggleAttribute(this.name, !!e && e !== R);
	}
}, he = class extends G {
	constructor(e, t, n, r, i) {
		super(e, t, n, r, i), this.type = 5;
	}
	_$AI(e, t = this) {
		if ((e = U(this, e, t, 0) ?? R) === L) return;
		let n = this._$AH, r = e === R && n !== R || e.capture !== n.capture || e.once !== n.once || e.passive !== n.passive, i = e !== R && (n === R || r);
		r && this.element.removeEventListener(this.name, this, n), i && this.element.addEventListener(this.name, this, e), this._$AH = e;
	}
	handleEvent(e) {
		typeof this._$AH == "function" ? this._$AH.call(this.options?.host ?? this.element, e) : this._$AH.handleEvent(e);
	}
}, ge = class {
	constructor(e, t, n) {
		this.element = e, this.type = 6, this._$AN = void 0, this._$AM = t, this.options = n;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	_$AI(e) {
		U(this, e);
	}
}, _e = y.litHtmlPolyfillSupport;
_e?.(H, W), (y.litHtmlVersions ??= []).push("3.3.3");
var ve = (e, t, n) => {
	let r = n?.renderBefore ?? t, i = r._$litPart$;
	if (i === void 0) {
		let e = n?.renderBefore ?? null;
		r._$litPart$ = i = new W(t.insertBefore(D(), e), e, void 0, n ?? {});
	}
	return i._$AI(e), i;
}, K = globalThis, q = class extends v {
	constructor() {
		super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
	}
	createRenderRoot() {
		let e = super.createRenderRoot();
		return this.renderOptions.renderBefore ??= e.firstChild, e;
	}
	update(e) {
		let t = this.render();
		this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(e), this._$Do = ve(t, this.renderRoot, this.renderOptions);
	}
	connectedCallback() {
		super.connectedCallback(), this._$Do?.setConnected(!0);
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this._$Do?.setConnected(!1);
	}
	render() {
		return L;
	}
};
q._$litElement$ = !0, q.finalized = !0, K.litElementHydrateSupport?.({ LitElement: q });
var ye = K.litElementPolyfillSupport;
ye?.({ LitElement: q }), (K.litElementVersions ??= []).push("4.2.2");
//#endregion
//#region src/preview.ts
var J = 440, be = 98, xe = 50, Se = 42, Ce = 312, we = J / 2, Te = 156, Y = (e) => ({
	x: we + (e.x + e.y) * be,
	y: Te + (e.x - e.y) * xe - e.z * Se
}), X = (e) => e.map((e) => `${Y(e).x},${Y(e).y}`).join(" "), Ee = (e) => e.reduce((e, t) => e + t.x - t.y, 0) / e.length, Z = (e) => e.placed ?? e.position;
function De(e, t, n) {
	let r = e.slice(1).map((t, n) => Math.hypot(t.x - e[n].x, t.y - e[n].y)), i = r.reduce((e, t) => e + t, 0), a = (t) => {
		let n = t * i;
		for (let t = 0; t < r.length; t++) {
			if (n <= r[t] || t === r.length - 1) {
				let i = r[t] ? Math.min(1, n / r[t]) : 0;
				return {
					x: e[t].x + (e[t + 1].x - e[t].x) * i,
					y: e[t].y + (e[t + 1].y - e[t].y) * i
				};
			}
			n -= r[t];
		}
		return e[e.length - 1];
	};
	return [a(t), a(n)];
}
var Oe = class extends q {
	constructor(...e) {
		super(...e), this.channels = [], this.lightInfo = [], this.colors = {}, this.active = !1;
	}
	static {
		this.properties = {
			channels: { attribute: !1 },
			lightInfo: { attribute: !1 },
			colors: { attribute: !1 },
			active: { type: Boolean },
			hovered: { state: !0 }
		};
	}
	lights() {
		let e = new Map(this.lightInfo.map((e) => [e.id, e])), t = /* @__PURE__ */ new Map();
		for (let n of this.channels) {
			let r = n.light_id ?? `ch${n.id}`;
			if (!t.has(r)) {
				let i = e.get(r);
				t.set(r, {
					id: r,
					name: n.light ?? n.lights[0],
					channels: [],
					positions: i?.positions.length ? i.positions : [],
					segmentCount: i?.segment_count ?? 1
				});
			}
			t.get(r).channels.push(n);
		}
		for (let e of t.values()) e.channels.sort((e, t) => (e.segment ?? 0) - (t.segment ?? 0));
		return [...t.values()].sort((e, t) => e.name.localeCompare(t.name));
	}
	color(e) {
		return this.colors[String(e.id)] ?? "#000000";
	}
	paint(e) {
		this.dispatchEvent(new CustomEvent("paint", { detail: { channels: e.map((e) => e.id) } }));
	}
	hover(e) {
		this.hovered = e;
	}
	render() {
		if (!this.channels.length) return F`<div class="empty">
        Choose an entertainment area to see its lights.
      </div>`;
		let e = this.lights(), t = [...e].sort((e, t) => Ee(e.positions.length ? e.positions : e.channels.map(Z)) - Ee(t.positions.length ? t.positions : t.channels.map(Z)));
		return F`
      <div class="stage">
        <svg viewBox="0 0 ${J} ${Ce}" class=${this.active ? "live" : "faded"}>
          <polygon
            class="wall left"
            points=${X([
			{
				x: -1,
				y: 1,
				z: -1
			},
			{
				x: -1,
				y: -1,
				z: -1
			},
			{
				x: -1,
				y: -1,
				z: 1
			},
			{
				x: -1,
				y: 1,
				z: 1
			}
		])}
          ></polygon>
          <polygon
            class="wall front"
            points=${X([
			{
				x: -1,
				y: 1,
				z: -1
			},
			{
				x: 1,
				y: 1,
				z: -1
			},
			{
				x: 1,
				y: 1,
				z: 1
			},
			{
				x: -1,
				y: 1,
				z: 1
			}
		])}
          ></polygon>
          <polygon
            class="floor"
            points=${X([
			{
				x: -1,
				y: 1,
				z: -1
			},
			{
				x: 1,
				y: 1,
				z: -1
			},
			{
				x: 1,
				y: -1,
				z: -1
			},
			{
				x: -1,
				y: -1,
				z: -1
			}
		])}
          ></polygon>
          <!-- 16:9 on screen (walls are drawn flatter than the floor), at the height
               the Hue app shows it: TV backlights around the middle of the screen -->
          <polygon
            class="tv"
            points=${X([
			{
				x: -.3,
				y: 1,
				z: -.42
			},
			{
				x: .3,
				y: 1,
				z: -.42
			},
			{
				x: .3,
				y: 1,
				z: .46
			},
			{
				x: -.3,
				y: 1,
				z: .46
			}
		])}
          ></polygon>
          ${t.map((e) => e.positions.length > 1 ? this.bar(e) : this.dot(e))}
        </svg>
        <div class="hint">
          ${this.hovered ? `${this.hovered.name} · channel ${this.hovered.channels.map((e) => e.id).join(", ")}` : "\xA0"}
        </div>
      </div>
      <div class="legend">
        ${e.map((e) => F`
            <button
              class="chip"
              title="Paint ${e.name}"
              @click=${() => this.paint(e.channels)}
              @mouseenter=${() => this.hover(e)}
              @mouseleave=${() => this.hover()}
            >
              <span class="swatch">
                ${e.channels.map((e) => F`<span style="background:${this.color(e)}"></span>`)}
              </span>
              <span class="chip-name">${e.name}</span>
              <span class="ids">${e.channels.map((e) => e.id).join(", ")}</span>
            </button>
          `)}
      </div>
    `;
	}
	pole(e) {
		if (e.z <= -.97) return I``;
		let t = Y({
			...e,
			z: -1
		}), n = Y(e);
		return I`
      <line class="pole" x1=${t.x} y1=${t.y} x2=${n.x} y2=${n.y}></line>
      <ellipse class="foot" cx=${t.x} cy=${t.y} rx="4.5" ry="2.2"></ellipse>
    `;
	}
	dot(e) {
		let t = e.channels[0], n = e.positions[0] ?? Z(t), { x: r, y: i } = Y(n), a = this.color(t), o = this.hovered === e;
		return I`
      <g class="light" @click=${() => this.paint([t])}
        @mouseenter=${() => this.hover(e)} @mouseleave=${() => this.hover()}>
        ${this.pole(n)}
        <circle cx=${r} cy=${i} r="14" fill=${a} class="glow"></circle>
        <circle cx=${r} cy=${i} r="7" fill=${a} class=${o ? "core hot" : "core"}></circle>
      </g>
    `;
	}
	bar(e) {
		let t = e.positions.map(Y), n = (e) => e.map((e, t) => `${t ? "L" : "M"}${e.x},${e.y}`).join(" "), r = t[0], i = t[t.length - 1], a = `g-${e.id}`, o = e.channels.length, s = e.channels.map((e, t) => I`<stop offset=${o > 1 ? t / (o - 1) : 0} stop-color=${this.color(e)}></stop>`), c = this.hovered === e;
		return I`
      <g class="light" @mouseenter=${() => this.hover(e)} @mouseleave=${() => this.hover()}>
        ${this.pole(e.positions[0])} ${this.pole(e.positions[e.positions.length - 1])}
        <defs>
          <linearGradient id=${a} gradientUnits="userSpaceOnUse"
            x1=${r.x} y1=${r.y} x2=${i.x} y2=${i.y}>${s}</linearGradient>
        </defs>
        <path d=${n(t)} stroke=${`url(#${a})`} class="bar-glow"></path>
        <path d=${n(t)} class="bar-edge"></path>
        <path d=${n(t)} stroke=${`url(#${a})`} class=${c ? "bar hot" : "bar"}></path>
        ${e.channels.map((e, r) => I`<path class="hit-bar" d=${n(De(t, r / o, (r + 1) / o))}
            @click=${() => this.paint([e])}></path>`)}
      </g>
    `;
	}
	static {
		this.styles = o`
    .stage {
      max-width: 600px;
      margin: 0 auto;
    }
    svg {
      width: 100%;
      height: auto;
      display: block;
    }
    .wall,
    .floor {
      stroke: var(--divider-color);
      stroke-width: 0.75;
    }
    .wall.left {
      fill: var(--secondary-background-color, rgba(127, 127, 127, 0.08));
    }
    .wall.front {
      fill: var(--primary-background-color, rgba(127, 127, 127, 0.04));
    }
    .floor {
      fill: var(--secondary-background-color, rgba(127, 127, 127, 0.12));
    }
    .tv {
      fill: var(--secondary-text-color);
      opacity: 0.35;
    }
    .pole {
      stroke: var(--secondary-text-color);
      stroke-width: 1.5;
      stroke-linecap: round;
      opacity: 0.5;
    }
    .foot {
      fill: var(--secondary-text-color);
      opacity: 0.35;
    }
    .glow {
      opacity: 0.3;
    }
    .core {
      stroke: #fff;
      stroke-width: 1.5;
    }
    .bar {
      fill: none;
      stroke-width: 7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .bar-edge {
      fill: none;
      stroke: #fff;
      stroke-width: 10;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .faded .bar-edge {
      opacity: 0.6;
    }
    .bar-glow {
      fill: none;
      stroke-width: 18;
      stroke-linecap: round;
      opacity: 0.18;
    }
    .faded .glow,
    .faded .bar-glow {
      display: none;
    }
    .faded .core,
    .faded .bar {
      opacity: 0.45;
    }
    .light {
      cursor: pointer;
    }
    .hit-bar {
      fill: none;
      stroke: transparent;
      stroke-width: 26;
      pointer-events: stroke;
    }
    .core.hot {
      stroke: var(--primary-text-color);
      stroke-width: 2;
    }
    .bar.hot {
      stroke-width: 10;
    }
    .hint {
      text-align: center;
      font-size: 13px;
      color: var(--secondary-text-color);
      min-height: 18px;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
      margin-top: 8px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px 4px 6px;
      border-radius: 14px;
      border: 1px solid var(--divider-color);
      background: none;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }
    .chip:hover {
      border-color: var(--primary-color);
    }
    .swatch {
      display: inline-flex;
      border-radius: 50%;
      overflow: hidden;
      width: 16px;
      height: 16px;
      border: 1px solid var(--divider-color);
    }
    .swatch span {
      flex: 1;
    }
    .ids {
      color: var(--secondary-text-color);
      font-size: 12px;
    }
    .empty {
      color: var(--secondary-text-color);
      padding: 24px 0;
      text-align: center;
    }
  `;
	}
};
customElements.define("hue-room-preview", Oe);
//#endregion
//#region src/scenes.ts
var ke = class extends q {
	constructor(...e) {
		super(...e), this.scenes = [], this.playing = null, this.playingParams = null, this.speed = 1, this.disabled = !1, this.drafts = {};
	}
	static {
		this.properties = {
			scenes: { attribute: !1 },
			playing: { attribute: !1 },
			playingParams: { attribute: !1 },
			speed: { type: Number },
			disabled: { type: Boolean },
			selected: { state: !0 },
			drafts: { state: !0 },
			speedDraft: { state: !0 }
		};
	}
	get current() {
		let e = this.selected ?? this.playing ?? this.scenes[0]?.id;
		return this.scenes.find((t) => t.id === e);
	}
	values(e) {
		let t = Object.fromEntries(Object.entries(e.parameters).map(([e, t]) => [e, t.default])), n = e.id === this.playing ? this.playingParams ?? {} : {};
		return {
			...t,
			...n,
			...this.drafts[e.id] ?? {}
		};
	}
	setValue(e, t, n) {
		this.drafts = {
			...this.drafts,
			[e.id]: {
				...this.drafts[e.id] ?? {},
				[t]: n
			}
		};
	}
	fire(e, t = {}) {
		this.dispatchEvent(new CustomEvent(e, { detail: t }));
	}
	play(e, t) {
		this.fire("play", {
			scene: e.id,
			params: t
		});
	}
	reloadScenes() {
		this.fire("reload-scenes");
	}
	render() {
		let e = this.current;
		return F`
      <div class="grid">
        ${this.renderList()} ${e ? this.renderForm(e) : R}
      </div>
    `;
	}
	renderList() {
		let e = this.speedDraft ?? this.speed;
		return F`
      <div class="card">
        <div class="row">
          <span class="value">Scenes</span>
          <span>
            <button
              @click=${(e) => {
			e.stopPropagation(), this.reloadScenes();
		}}
            >
              Reload Scenes
            </button>
            <span class="secondary small">${this.scenes.length} available</span>
          </span>
        </div>
        <div class="list">
          ${this.scenes.map((e) => {
			let t = e.id === this.playing;
			return F`
              <div
                class="scene ${t ? "on" : ""} ${e.id === this.current?.id ? "selected" : ""}"
                @click=${() => this.selected = e.id}
              >
                <div class="info">
                  <div class="name">${e.name}</div>
                  ${e.description ? F`<div class="secondary small">${e.description}</div>` : R}
                </div>
                <span class="tag">${e.builtin ? "built-in" : "yours"}</span>
                <button
                  class=${t ? "stop" : "play"}
                  ?disabled=${this.disabled}
                  @click=${(n) => {
				n.stopPropagation(), t ? this.fire("stop") : this.play(e, this.drafts[e.id] ? this.values(e) : void 0);
			}}
                >
                  ${t ? "Stop" : "Play"}
                </button>
              </div>
            `;
		})}
        </div>
        <label class="row speed">
          <span class="secondary small">Speed</span>
          <input
            type="range"
            min="0.1"
            max="4"
            step="0.1"
            .value=${String(e)}
            ?disabled=${this.disabled}
            @input=${(e) => this.speedDraft = Number(e.target.value)}
            @change=${(e) => {
			this.fire("speed", { speed: Number(e.target.value) }), this.speedDraft = void 0;
		}}
          />
          <span class="small">${e.toFixed(1)}×</span>
        </label>
      </div>
    `;
	}
	renderForm(e) {
		let t = Object.entries(e.parameters), n = this.values(e);
		return F`
      <div class="card">
        <div class="row">
          <span class="value">${e.name}</span>
          <span class="secondary small">
            ${e.author ? `by ${e.author}` : ""}
            ${e.duration ? ` · plays ${e.duration} s` : ""}
          </span>
        </div>
        ${t.length ? F`<div class="form">
                ${t.map(([t, r]) => this.field(e, t, r, n[t]))}
              </div>` : F`<div class="secondary small">This scene has no settings.</div>`}
        <div class="row actions">
          <button
            ?disabled=${!this.drafts[e.id]}
            @click=${() => {
			let t = { ...this.drafts };
			delete t[e.id], this.drafts = t;
		}}
          >
            Reset
          </button>
          <button
            class="primary"
            ?disabled=${this.disabled}
            @click=${() => this.play(e, n)}
          >
            ${e.id === this.playing ? "Apply" : "Play with these"}
          </button>
        </div>
      </div>
    `;
	}
	field(e, t, n, r) {
		let i = t.replace(/_/g, " "), a = (n) => this.setValue(e, t, n);
		if (n.type === "color") return F`
        <label class="field">
          <span>${i}</span>
          <input
            type="color"
            .value=${Ae(r)}
            @input=${(e) => a(e.target.value)}
          />
        </label>
      `;
		if (n.type === "number") {
			let e = Number(r), t = n.min ?? 0, o = n.max ?? Math.max(1, Number(n.default) * 2);
			return F`
        <label class="field">
          <span>${i}</span>
          <input
            type="range"
            min=${t}
            max=${o}
            step=${(o - t) / 100}
            .value=${String(e)}
            @input=${(e) => a(Number(e.target.value))}
          />
          <span class="small num">${je(e)}</span>
        </label>
      `;
		}
		let o = n.options ?? [];
		return o.length === 2 && o.every((e) => typeof e == "boolean") ? F`
        <label class="field">
          <span>${i}</span>
          <input
            type="checkbox"
            role="switch"
            .checked=${!!r}
            @change=${(e) => a(e.target.checked)}
          />
        </label>
      ` : F`
      <label class="field">
        <span>${i}</span>
        <select
          @change=${(e) => a(o[Number(e.target.value)])}
        >
          ${o.map((e, t) => F`<option value=${t} ?selected=${e === r}>${String(e)}</option>`)}
        </select>
      </label>
    `;
	}
	static {
		this.styles = o`
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
    }
    .card {
      background: var(--card-background-color, #fff);
      border-radius: var(--ha-card-border-radius, 12px);
      border: 1px solid var(--divider-color);
      padding: 16px;
      display: grid;
      gap: 12px;
      align-content: start;
    }
    .row,
    .field {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .value {
      font-size: 16px;
      font-weight: 500;
    }
    .secondary {
      color: var(--secondary-text-color);
    }
    .small {
      font-size: 13px;
    }
    .list {
      display: grid;
    }
    .scene {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      border-top: 1px solid var(--divider-color);
      cursor: pointer;
    }
    .scene.selected {
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.08));
      border-radius: 8px;
    }
    .scene.on .name {
      color: var(--primary-color);
      font-weight: 500;
    }
    .info {
      flex: 1;
      min-width: 0;
    }
    .tag {
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    button {
      font: inherit;
      font-size: 13px;
      padding: 5px 12px;
      border-radius: 8px;
      border: 1px solid var(--divider-color);
      background: none;
      color: var(--primary-text-color);
      cursor: pointer;
    }
    button.primary,
    button.stop {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .speed input {
      flex: 1;
    }
    .form {
      display: grid;
      gap: 10px;
    }
    .field span:first-child {
      color: var(--secondary-text-color);
      font-size: 14px;
      text-transform: capitalize;
      min-width: 90px;
    }
    .field input[type="range"] {
      flex: 1;
    }
    .num {
      min-width: 36px;
      text-align: right;
    }
    .actions {
      justify-content: flex-end;
    }
    input[type="range"] {
      accent-color: var(--primary-color);
    }
    input[type="color"] {
      width: 44px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--divider-color);
      border-radius: 6px;
      background: none;
      cursor: pointer;
    }
    select {
      font: inherit;
      color: inherit;
      padding: 6px;
      border-radius: 8px;
      border: 1px solid var(--divider-color);
      background: var(--secondary-background-color, transparent);
    }
    input[role="switch"] {
      appearance: none;
      width: 36px;
      height: 20px;
      border-radius: 10px;
      background: var(--disabled-color, #bdbdbd);
      position: relative;
      cursor: pointer;
    }
    input[role="switch"]::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      transition: left 0.15s;
    }
    input[role="switch"]:checked {
      background: var(--primary-color);
    }
    input[role="switch"]:checked::after {
      left: 18px;
    }
  `;
	}
};
function Ae(e) {
	return typeof e == "string" && /^#?[0-9a-f]{6}/i.test(e) ? `#${e.replace("#", "").slice(0, 6)}` : Array.isArray(e) && e.length >= 3 ? `#${e.slice(0, 3).map((e) => Math.max(0, Math.min(255, Math.round(Number(e)))).toString(16).padStart(2, "0")).join("")}` : "#000000";
}
function je(e) {
	return Math.abs(e) >= 10 ? e.toFixed(0) : String(Number(e.toFixed(2)));
}
customElements.define("hue-scene-panel", ke);
//#endregion
//#region src/panel.ts
var Q = "ha_hue_entertainment", Me = `/config/integrations/integration/${Q}`, Ne = class extends q {
	constructor(...e) {
		super(...e), this.narrow = !1, this.zones = [], this.scenes = [], this.busy = !1, this.colors = {
			channels: {},
			brightness: 1
		}, this.paintColor = "#ff7a00";
	}
	static {
		this.properties = {
			hass: { attribute: !1 },
			narrow: { type: Boolean },
			status: { state: !0 },
			zones: { state: !0 },
			scenes: { state: !0 },
			message: { state: !0 },
			busy: { state: !0 },
			colors: { state: !0 },
			paintColor: { state: !0 },
			brightnessDraft: { state: !0 }
		};
	}
	updated(e) {
		e.has("hass") && this.hass && !this.unsubscribe && this.connect();
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this.unsubscribe?.(), this.unsubscribe = void 0;
	}
	async connect() {
		try {
			this.unsubscribe = await this.hass.connection.subscribeMessage((e) => {
				e.type === "status" ? this.status = e : e.type === "colors" && (this.colors = e);
			}, {
				type: `${Q}/subscribe`,
				colors: !0
			}), [this.zones, this.scenes] = await Promise.all([this.call("zones"), this.call("scenes")]);
		} catch (e) {
			this.message = $(e);
		}
	}
	call(e, t = {}) {
		return this.hass.connection.sendMessagePromise({
			type: `${Q}/${e}`,
			...t
		});
	}
	async act(e, t = {}) {
		this.busy = !0;
		try {
			await this.call(e, t), this.message = void 0;
		} catch (e) {
			this.message = $(e);
		} finally {
			this.busy = !1;
		}
	}
	navigate(e) {
		history.pushState(null, "", e), window.dispatchEvent(new CustomEvent("location-changed"));
	}
	render() {
		return F`
      <div class="toolbar">
        <ha-menu-button .hass=${this.hass} .narrow=${this.narrow}></ha-menu-button>
        <div class="title">Hue Entertainment</div>
        ${this.renderStatePill()}
      </div>
      <div class="content">
        ${this.status ? F`<div class="cards">
                  ${this.renderBridge()} ${this.renderZone()} ${this.renderToggles()}
                </div>
                ${this.renderMessage()} ${this.renderPreview()} ${this.renderScenes()}` : this.message ? this.renderMessage() : F`<div class="card">Loading…</div>`}
      </div>
    `;
	}
	renderStatePill() {
		let e = this.status?.streaming;
		if (!e) return R;
		let t = this.status?.live, n = e.state === "streaming" && t ? `Live · ${t.client}` : e.state === "streaming" ? `Streaming · ${Math.round(e.send_fps)}/s` : e.state === "reconnecting" ? "Reconnecting" : "Off";
		return F`<span class="pill ${e.state}">${n}</span>`;
	}
	renderBridge() {
		let e = this.status.bridge;
		return F`
      <div class="card">
        <div class="label">Bridge</div>
        <div class="row">
          <span class="value">${e?.name ?? "Not paired"}</span>
          <span class="secondary">${e?.host ?? ""}</span>
        </div>
        <a
          class="link"
          href=${Me}
          @click=${(e) => {
			e.preventDefault(), this.navigate(Me);
		}}
          >Manage in Devices and services</a
        >
      </div>
    `;
	}
	renderZone() {
		let e = this.status.zone?.id ?? "";
		return F`
      <div class="card">
        <label class="label" for="zone">Entertainment area</label>
        <select
          id="zone"
          .value=${e}
          ?disabled=${this.busy || !this.zones.length}
          @change=${(e) => this.act("zone/select", { zone_id: e.target.value })}
        >
          ${e ? R : F`<option value="" selected>Choose an area</option>`}
          ${this.zones.map((t) => F`<option value=${t.id} ?selected=${t.id === e}>
                ${t.name} · ${t.channel_count} channels
              </option>`)}
        </select>
        ${this.zones.length ? R : F`<div class="secondary small">
                No entertainment areas. Create one in the Hue app under Settings,
                Entertainment areas.
              </div>`}
      </div>
    `;
	}
	renderToggles() {
		let e = this.status, t = e.streaming.target_fps !== null;
		return F`
      <div class="card toggles">
        ${this.toggle("Sync", t, !e.zone, (e) => this.act("sync", { on: e }))}
        ${this.toggle("Allow override", e.allow_override, !1, (e) => this.act("override", { allow: e }), "Starting sync may stop another app, like a Hue Sync Box")}
      </div>
    `;
	}
	toggle(e, t, n, r, i) {
		return F`
      <label class="toggle-row" title=${i ?? ""}>
        <span>${e}</span>
        <input
          type="checkbox"
          role="switch"
          .checked=${t}
          ?disabled=${n || this.busy}
          @change=${(e) => r(e.target.checked)}
        />
      </label>
    `;
	}
	renderPreview() {
		let e = this.status, t = e.streaming.target_fps !== null, n = this.brightnessDraft ?? Math.round(this.colors.brightness * 100);
		return F`
      <div class="card">
        <div class="row">
          <span class="value">Live preview</span>
          <span class="secondary small">
            ${t ? "Select a light to paint it." : "Sync is off. Showing the colours sync starts with."}
          </span>
        </div>
        <hue-room-preview
          .channels=${e.zone_layout?.channels ?? []}
          .lightInfo=${e.zone_layout?.lights ?? []}
          .colors=${this.colors.channels}
          ?active=${t}
          @paint=${(t) => this.act("colors/set", {
			channels: Object.fromEntries(t.detail.channels.map((e) => [e, this.paintColor])),
			overlay: e.scene.id !== null || e.live !== null
		})}
        ></hue-room-preview>
        <div class="row controls">
          <label class="row">
            <input
              type="color"
              .value=${this.paintColor}
              @input=${(e) => this.paintColor = e.target.value}
            />
            <span class="secondary small">Paint colour</span>
          </label>
          <label class="row grow">
            <span class="secondary small">Brightness</span>
            <input
              class="grow"
              type="range"
              min="0"
              max="100"
              step="1"
              .value=${String(n)}
              @input=${(e) => this.brightnessDraft = Number(e.target.value)}
              @change=${async (e) => {
			await this.act("colors/set", {
				brightness: Number(e.target.value) / 100,
				start: !1
			}), this.brightnessDraft = void 0;
		}}
            />
            <span class="small">${n}%</span>
          </label>
        </div>
      </div>
    `;
	}
	renderScenes() {
		let e = this.status;
		return F`
      <hue-scene-panel
        .scenes=${this.scenes}
        .playing=${e.scene.id}
        .playingParams=${e.scene.params}
        .speed=${e.scene.speed}
        ?disabled=${this.busy || !e.zone}
        @play=${(e) => this.act("scene/play", {
			scene: e.detail.scene,
			...e.detail.params ? { params: e.detail.params } : {}
		})}
        @stop=${() => this.act("scene/stop")}
        @speed=${(e) => this.act("speed", { speed: e.detail.speed })}
        @reload-scenes=${async () => {
			try {
				this.scenes = await this.call("scenes/reload"), this.message = void 0;
			} catch (e) {
				this.message = $(e);
			}
		}}
      ></hue-scene-panel>
    `;
	}
	renderMessage() {
		let e = this.status?.live, t = this.message ?? this.status?.streaming.error;
		return F`
      ${e ? F`<div class="info">
              <span
                >Live control by <b>${e.client}</b> since
                ${(/* @__PURE__ */ new Date(e.since * 1e3)).toLocaleTimeString()}. Painting draws on
                top.</span
              >
              <button ?disabled=${this.busy} @click=${() => this.act("live/revoke")}>
                Take over
              </button>
            </div>` : R}
      ${t ? F`<div class="message" role="alert">${t}</div>` : R}
    `;
	}
	static {
		this.styles = o`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--primary-background-color);
      color: var(--primary-text-color);
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      height: var(--header-height, 56px);
      padding: 0 12px;
      background: var(--app-header-background-color, var(--primary-color));
      color: var(--app-header-text-color, var(--text-primary-color));
      font-size: 20px;
    }
    .title {
      flex: 1;
    }
    .pill {
      font-size: 13px;
      padding: 3px 10px;
      border-radius: 12px;
      background: rgba(127, 127, 127, 0.25);
    }
    .pill.streaming {
      background: var(--success-color, #43a047);
      color: #fff;
    }
    .pill.reconnecting {
      background: var(--warning-color, #ffa600);
      color: #000;
    }
    .content {
      padding: 16px;
      max-width: 1100px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }
    .card {
      background: var(--card-background-color, #fff);
      border-radius: var(--ha-card-border-radius, 12px);
      border: 1px solid var(--divider-color);
      padding: 16px;
      display: grid;
      gap: 10px;
      align-content: start;
    }
    .label {
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .row,
    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .value {
      font-size: 16px;
      font-weight: 500;
    }
    .secondary {
      color: var(--secondary-text-color);
    }
    .small {
      font-size: 13px;
    }
    .link {
      font-size: 13px;
      color: var(--primary-color);
      text-decoration: none;
    }
    select {
      font: inherit;
      color: inherit;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid var(--divider-color);
      background: var(--secondary-background-color, transparent);
    }
    .toggles {
      gap: 14px;
    }
    .toggle-row span {
      font-size: 15px;
    }
    input[role="switch"] {
      appearance: none;
      width: 36px;
      height: 20px;
      border-radius: 10px;
      background: var(--disabled-color, #bdbdbd);
      position: relative;
      cursor: pointer;
      transition: background 0.15s;
    }
    input[role="switch"]::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      transition: left 0.15s;
    }
    input[role="switch"]:checked {
      background: var(--primary-color);
    }
    input[role="switch"]:checked::after {
      left: 18px;
    }
    input[role="switch"]:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .controls {
      flex-wrap: wrap;
    }
    .grow {
      flex: 1;
    }
    input[type="color"] {
      width: 40px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--divider-color);
      border-radius: 6px;
      background: none;
      cursor: pointer;
    }
    input[type="range"] {
      accent-color: var(--primary-color);
    }
    .info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(3, 169, 244, 0.12);
      border: 1px solid var(--info-color, #039be5);
    }
    .info button {
      font: inherit;
      font-size: 13px;
      padding: 5px 12px;
      border-radius: 8px;
      border: 1px solid var(--primary-color);
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      cursor: pointer;
    }
    .message {
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(255, 166, 0, 0.15);
      border: 1px solid var(--warning-color, #ffa600);
    }
  `;
	}
};
function $(e) {
	return e.message ?? String(e);
}
customElements.define("ha-hue-entertainment-panel", Ne);
//#endregion
