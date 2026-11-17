// Copyright 2026 Nightfall & OpenSSF Scorecard Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package scorecard

import (
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"

	"github.com/ossf/scorecard/v5/checker"
	docs "github.com/ossf/scorecard/v5/docs/checks"
	sce "github.com/ossf/scorecard/v5/errors"
	"github.com/ossf/scorecard/v5/finding"
	"github.com/ossf/scorecard/v5/log"
)

// NightfallRepoInfo describes the analyzed target repository in Nightfall's canonical schema.
type NightfallRepoInfo struct {
	Name       string `json:"name"`
	Commit     string `json:"commit"`
	TargetType string `json:"targetType"`
}

// NightfallRiskSummary aggregates failing vs passing check counts by risk tier.
type NightfallRiskSummary struct {
	CriticalFailing    int `json:"criticalFailing"`
	HighFailing        int `json:"highFailing"`
	MediumFailing      int `json:"mediumFailing"`
	LowFailing         int `json:"lowFailing"`
	PassingChecks      int `json:"passingChecks"`
	InconclusiveChecks int `json:"inconclusiveChecks"`
}

// NightfallFindingLocation provides normalized file and line span references.
type NightfallFindingLocation struct {
	Path      string  `json:"path"`
	Type      string  `json:"type"`
	LineStart *uint   `json:"lineStart,omitempty"`
	LineEnd   *uint   `json:"lineEnd,omitempty"`
	Snippet   *string `json:"snippet,omitempty"`
}

// NightfallFindingRemediation provides remediation guidance and optional unified diff patch.
type NightfallFindingRemediation struct {
	Text     string  `json:"text"`
	Markdown string  `json:"markdown"`
	Effort   string  `json:"effort"`
	Patch    *string `json:"patch,omitempty"`
}

// NightfallProbeFinding serializes structured probe findings attached to each check.
type NightfallProbeFinding struct {
	Probe       string                       `json:"probe"`
	Outcome     string                       `json:"outcome"`
	Message     string                       `json:"message"`
	Location    *NightfallFindingLocation    `json:"location,omitempty"`
	Remediation *NightfallFindingRemediation `json:"remediation,omitempty"`
	Values      map[string]string            `json:"values,omitempty"`
}

// NightfallCheckResult combines check scoring, documentation metadata, and structured findings.
type NightfallCheckResult struct {
	Name             string                  `json:"name"`
	Score            int                     `json:"score"`
	Status           string                  `json:"status"`
	Risk             string                  `json:"risk"`
	Reason           string                  `json:"reason"`
	Short            string                  `json:"short"`
	Description      string                  `json:"description"`
	Tags             []string                `json:"tags"`
	RemediationSteps []string                `json:"remediationSteps"`
	DocumentationURL string                  `json:"documentationUrl"`
	Details          []string                `json:"details"`
	Annotations      []string                `json:"annotations,omitempty"`
	Findings         []NightfallProbeFinding `json:"findings"`
}

// NightfallScorecardReport is Nightfall's single-pass fused Scorecard envelope.
type NightfallScorecardReport struct {
	Service        string                 `json:"service"`
	Date           string                 `json:"date"`
	Repo           NightfallRepoInfo      `json:"repo"`
	Scorecard      jsonScorecardV2        `json:"scorecard"`
	AggregateScore jsonFloatScore         `json:"score"`
	RiskSummary    NightfallRiskSummary   `json:"riskSummary"`
	Checks         []NightfallCheckResult `json:"checks"`
	Metadata       []string               `json:"metadata"`
}

// NightfallCheckCatalogEntry describes an embedded Scorecard check definition.
type NightfallCheckCatalogEntry struct {
	Name               string   `json:"name"`
	Risk               string   `json:"risk"`
	Short              string   `json:"short"`
	Description        string   `json:"description"`
	Tags               []string `json:"tags"`
	RemediationSteps   []string `json:"remediationSteps"`
	SupportedRepoTypes []string `json:"supportedRepoTypes"`
	DocumentationURL   string   `json:"documentationUrl"`
}

func fileTypeLabel(ft finding.FileType) string {
	switch ft {
	case finding.FileTypeSource:
		return "source"
	case finding.FileTypeBinary:
		return "binary"
	case finding.FileTypeText:
		return "text"
	case finding.FileTypeURL:
		return "url"
	case finding.FileTypeBinaryVerified:
		return "binary_verified"
	default:
		return "none"
	}
}

func effortLabel(eff finding.RemediationEffort) string {
	switch eff {
	case finding.RemediationEffortLow:
		return "low"
	case finding.RemediationEffortMedium:
		return "medium"
	case finding.RemediationEffortHigh:
		return "high"
	default:
		return "none"
	}
}

func classifyCheckStatus(score int) string {
	switch {
	case score < 0:
		return "inconclusive"
	case score >= 8:
		return "pass"
	case score >= 5:
		return "warn"
	default:
		return "fail"
	}
}

func convertFinding(f finding.Finding) NightfallProbeFinding {
	out := NightfallProbeFinding{
		Probe:   f.Probe,
		Outcome: string(f.Outcome),
		Message: f.Message,
		Values:  f.Values,
	}
	if f.Location != nil {
		out.Location = &NightfallFindingLocation{
			Path:      f.Location.Path,
			Type:      fileTypeLabel(f.Location.Type),
			LineStart: f.Location.LineStart,
			LineEnd:   f.Location.LineEnd,
			Snippet:   f.Location.Snippet,
		}
	}
	if f.Remediation != nil {
		out.Remediation = &NightfallFindingRemediation{
			Text:     f.Remediation.Text,
			Markdown: f.Remediation.Markdown,
			Effort:   effortLabel(f.Remediation.Effort),
			Patch:    f.Remediation.Patch,
		}
	}
	return out
}

// BuildNightfallCheckCatalog returns the sorted catalog of embedded Scorecard checks.
func BuildNightfallCheckCatalog(checkDocs docs.Doc, commitSHA string) []NightfallCheckCatalogEntry {
	if commitSHA == "" {
		commitSHA = "main"
	}
	rawChecks := checkDocs.GetChecks()
	entries := make([]NightfallCheckCatalogEntry, 0, len(rawChecks))
	for _, c := range rawChecks {
		tags := c.GetTags()
		if tags == nil {
			tags = []string{}
		}
		rem := c.GetRemediation()
		if rem == nil {
			rem = []string{}
		}
		repos := c.GetSupportedRepoTypes()
		if repos == nil {
			repos = []string{}
		}
		entries = append(entries, NightfallCheckCatalogEntry{
			Name:               c.GetName(),
			Risk:               c.GetRisk(),
			Short:              strings.TrimSpace(c.GetShort()),
			Description:        strings.TrimSpace(c.GetDescription()),
			Tags:               tags,
			RemediationSteps:   rem,
			SupportedRepoTypes: repos,
			DocumentationURL:   c.GetDocumentationURL(commitSHA),
		})
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name < entries[j].Name
	})
	return entries
}

// ToNightfallReport builds Nightfall's unified Scorecard report in a single pass.
func (r *Result) ToNightfallReport(checkDocs docs.Doc, opt *AsJSON2ResultOption) (NightfallScorecardReport, error) {
	if opt == nil {
		opt = &AsJSON2ResultOption{
			LogLevel:    log.DefaultLevel,
			Details:     true,
			Annotations: true,
		}
	}

	aggScore, err := r.GetAggregateScore(checkDocs)
	if err != nil {
		return NightfallScorecardReport{}, err
	}

	targetType := "remote"
	if strings.HasPrefix(r.Repo.Name, "file://") {
		targetType = "local"
	}

	metadata := r.Metadata
	if metadata == nil {
		metadata = []string{}
	}

	report := NightfallScorecardReport{
		Service: "nightfall-scorecard",
		Date:    r.Date.UTC().Format(time.RFC3339),
		Repo: NightfallRepoInfo{
			Name:       r.Repo.Name,
			Commit:     r.Repo.CommitSHA,
			TargetType: targetType,
		},
		Scorecard: jsonScorecardV2{
			Version: r.Scorecard.Version,
			Commit:  r.Scorecard.CommitSHA,
		},
		AggregateScore: jsonFloatScore(aggScore),
		Checks:         make([]NightfallCheckResult, 0, len(r.Checks)),
		Metadata:       metadata,
	}

	for _, cr := range r.Checks {
		doc, docErr := checkDocs.GetCheck(cr.Name)
		if docErr != nil {
			return report, fmt.Errorf("GetCheck %s: %w", cr.Name, docErr)
		}

		status := classifyCheckStatus(cr.Score)
		risk := doc.GetRisk()
		switch status {
		case "inconclusive":
			report.RiskSummary.InconclusiveChecks++
		case "pass":
			report.RiskSummary.PassingChecks++
		default:
			switch risk {
			case "Critical":
				report.RiskSummary.CriticalFailing++
			case "High":
				report.RiskSummary.HighFailing++
			case "Medium":
				report.RiskSummary.MediumFailing++
			default:
				report.RiskSummary.LowFailing++
			}
		}

		details := []string{}
		for idx := range cr.Details {
			d := cr.Details[idx]
			if msg := DetailToString(&d, opt.LogLevel); msg != "" {
				details = append(details, msg)
			}
		}

		findings := make([]NightfallProbeFinding, 0, len(cr.Findings))
		for _, f := range cr.Findings {
			findings = append(findings, convertFinding(f))
		}

		tags := doc.GetTags()
		if tags == nil {
			tags = []string{}
		}
		remSteps := doc.GetRemediation()
		if remSteps == nil {
			remSteps = []string{}
		}

		item := NightfallCheckResult{
			Name:             cr.Name,
			Score:            cr.Score,
			Status:           status,
			Risk:             risk,
			Reason:           cr.Reason,
			Short:            strings.TrimSpace(doc.GetShort()),
			Description:      strings.TrimSpace(doc.GetDescription()),
			Tags:             tags,
			RemediationSteps: remSteps,
			DocumentationURL: doc.GetDocumentationURL(r.Scorecard.CommitSHA),
			Details:          details,
			Findings:         findings,
		}
		if opt.Annotations {
			item.Annotations = append(item.Annotations, cr.Annotations(r.Config)...)
		}
		report.Checks = append(report.Checks, item)
	}

	return report, nil
}

// AsNightfallJSON encodes the unified Nightfall Scorecard JSON envelope.
func (r *Result) AsNightfallJSON(writer io.Writer, checkDocs docs.Doc, opt *AsJSON2ResultOption) error {
	report, err := r.ToNightfallReport(checkDocs, opt)
	if err != nil {
		return sce.WithMessage(sce.ErrScorecardInternal, err.Error())
	}
	encoder := json.NewEncoder(writer)
	if err := encoder.Encode(report); err != nil {
		return sce.WithMessage(sce.ErrScorecardInternal, fmt.Sprintf("encoder.Encode: %v", err))
	}
	return nil
}

// AsNightfallTable formats Scorecard results in Nightfall's deterministic key-value & aligned-column CLI style.
func (r *Result) AsNightfallTable(writer io.Writer, checkDocs docs.Doc, opt *AsStringResultOption) error {
	if opt == nil {
		opt = &AsStringResultOption{
			LogLevel:    log.DefaultLevel,
			Details:     false,
			Annotations: false,
		}
	}

	report, err := r.ToNightfallReport(checkDocs, &AsJSON2ResultOption{
		LogLevel:    opt.LogLevel,
		Details:     true,
		Annotations: opt.Annotations,
	})
	if err != nil {
		return sce.WithMessage(sce.ErrScorecardInternal, err.Error())
	}

	aggLabel := fmt.Sprintf("%.1f / %d.0", float64(report.AggregateScore), checker.MaxResultScore)
	if float64(report.AggregateScore) == float64(checker.InconclusiveResultScore) {
		aggLabel = "inconclusive (?)"
	}

	scoredCount := len(report.Checks) - report.RiskSummary.InconclusiveChecks
	rev := report.Repo.Commit
	if len(rev) > 12 {
		rev = rev[:12]
	}

	fmt.Fprintln(writer, "Nightfall Scorecard · Supply-Chain & Repository Posture")
	fmt.Fprintf(writer, "  Target Repository : %s (%s)\n", report.Repo.Name, report.Repo.TargetType)
	fmt.Fprintf(writer, "  Observed Revision : %s\n", rev)
	fmt.Fprintf(writer, "  Aggregate Score   : %s\n", aggLabel)
	fmt.Fprintf(writer, "  Evaluated Checks  : %d scored · %d passing · %d inconclusive\n",
		scoredCount, report.RiskSummary.PassingChecks, report.RiskSummary.InconclusiveChecks)
	fmt.Fprintf(writer, "  Failing by Risk   : %d critical · %d high · %d medium · %d low\n",
		report.RiskSummary.CriticalFailing,
		report.RiskSummary.HighFailing,
		report.RiskSummary.MediumFailing,
		report.RiskSummary.LowFailing,
	)

	if len(report.Checks) == 0 {
		return nil
	}

	fmt.Fprintln(writer)
	fmt.Fprintf(writer, "  %-8s  %-8s  %-12s  %-24s  %s\n", "SCORE", "RISK", "STATUS", "CHECK", "SUMMARY")
	fmt.Fprintf(writer, "  %-8s  %-8s  %-12s  %-24s  %s\n",
		"--------", "--------", "------------", "------------------------", "----------------------------------------")

	for _, c := range report.Checks {
		scoreText := fmt.Sprintf("%2d / %d", c.Score, checker.MaxResultScore)
		if c.Score < 0 {
			scoreText = "   ?   "
		}
		fmt.Fprintf(writer, "  %-8s  %-8s  %-12s  %-24s  %s\n",
			scoreText,
			c.Risk,
			strings.ToUpper(c.Status),
			c.Name,
			c.Reason,
		)
		if opt.Details && len(c.Details) > 0 {
			limit := len(c.Details)
			if limit > 6 {
				limit = 6
			}
			for i := 0; i < limit; i++ {
				fmt.Fprintf(writer, "      · %s\n", c.Details[i])
			}
			if len(c.Details) > limit {
				fmt.Fprintf(writer, "      · ... +%d additional detail(s)\n", len(c.Details)-limit)
			}
		}
	}

	return nil
}
