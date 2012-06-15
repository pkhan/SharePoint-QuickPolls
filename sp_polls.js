/*
Ways to manage a Poll, designed for SharePoint
Requires SPServices and JQuery

*/
"use strict";

$(document).ready(function(){
    
	//we grab any element with an id of poll_display and stick the poll in there
	var poll_elem = $("#poll_display");
	var question_id = 1;
    var conn;
    var poll;
    var display;
    
    //if the page is in edit mode, we don't want to display our poll, that can confuse the HTML editor
    if(poll_elem.length > 0 && $(".ms-WPAddButton").length == 0)
	{
		//There is a poll receiving element, let's fill it up
        
        conn = new SP_Poll_Connection("poll_list","poll_data");
        
		if( poll_elem.attr("title") == "autoconfig" )
		{
			//write the autostart capability
		}
		else
		{
			//the title attribute of the div contains the question to be polled
			question_id = poll_elem.attr("title");
            poll = conn.open_poll(question_id);
		}
        display = new Poll_Display(poll_elem,poll);
	
		if(!poll.already_voted())
		{
			//if they haven't voted yet, show them the vote panel
			display.load_vote();
			display.show_vote();
		}
		else
		{
			//if they already voted, show them the results
			display.load_results();
			display.show_results();
		}
	}
});


function SP_Poll_Connection(poll_list, poll_data)
{
	this.poll_list = poll_list;
	this.poll_data = poll_data;
	this.questions = [];
	this.lists_exist = true; //let's be naive here and assume the lists exist until we see that they don't
	
	this.create_poll = function create_poll(question_text, choices) {
		var sp_poll = new SP_Poll(this);
		sp_poll.question_text = question_text;
		sp_poll.question_id = this.questions.length + 1;
		for(var i = 0; i < choices.length; i++)
		{
			sp_poll.add_choice(new Choice(choices[i],0));
		}
		return sp_poll;
	};
	
	this.open_poll = function open_poll(qid) {
		var sp_poll = new SP_Poll(this);
		sp_poll.question_id = qid;
		sp_poll.opened = true;
		
        $().SPServices({
            operation: "GetListItems",
            async: false,
            listName: this.poll_list,
            CAMLViewFields: "<ViewFields><FieldRef Name='Title' /><FieldRef Name='p_type'/></ViewFields>",
            CAMLQuery: "<Query><Where><Eq><FieldRef Name='question_id' /><Value Type='Counter'>"+qid+
                "</Value></Eq></Where></Query>",
            completefunc: function (xData, Status) {
                $(xData.responseXML).SPFilterNode("z:row").each(function() {
                if( $(this).attr("ows_p_type") == "Question")
                {
                    sp_poll.question_text = $(this).attr("ows_Title");
                }
                else
                {
                    sp_poll.add_choice(new Choice( $(this).attr("ows_Title") , 0) );
                }
              });
            }
		});
		return sp_poll;
	};
	
	this.get_questions = function get_questions() {
		var questions = this.questions;
        $().SPServices({
            operation: "GetListItems",
            async: false,
            listName: this.poll_list,
            CAMLViewFields: "<ViewFields><FieldRef Name='Title' /></ViewFields>",
            CAMLQuery: "<Query><Where><Eq><FieldRef Name='p_type' /><Value Type='Text'>Question"+
				"</Value></Eq></Where></Query>",
            completefunc: function (xData, Status) {
                $(xData.responseXML).SPFilterNode("z:row").each(function() {
                    questions.push( $(this).attr("ows_Title") );
                });
            }
        });
	};
    
    this.create_tables = function(){
        //create poll_lists table
        $().SPServices({
            operation: "AddList",
            async: false,
            listName: this.poll_list,
            templateID: 100
        });

        //create poll_data table
        $().SPServices({
            operation: "AddList",
            async: false,
            listName: this.poll_data,
            templateID: 100
        });
        
        //poll_lists column setup: need <text> p_type <counter> question ID
        var new_fields_pl = "<Fields><Method ID='1'><Field Type='Text' Name='p_type' DisplayName='p_type' MaxLength='255' /></Method>";
        new_fields_pl += "<Method ID='2'><Field Type='Counter' Name='question_id' DisplayName='question_id' /></Method></Fields>";
        
        $().SPServices({
            operation: "UpdateList",
            async: false,
            listName: this.Poll_list,
            listProperties: "<List Hidden='TRUE' />",
            newFields: new_fields_pl
        });
        
        //poll_data column setup: needs <Counter> question_id
        var new_fields_pd = "<Fields><Method ID='1'><Field Type='Counter' Name='question_id' DisplayName='question_id' /></Method></Fields>";
        
        $().SPServicces({
            operation: "UpdateList",
            async: false,
            listName: this.poll_data,
            listProperties: "<List Hidden='TRUE' />",
            newFields: new_fields_pd
        });
        
    };
    
    this.config_set_question = function(question_id){
        var my_URL = window.location.pathname;
        $().SPServices({
                operation: "UpdateListItems",
                async: false,
                batchCmd: "New",
                listName: this.poll_list,
                valuepairs: [["Title", my_URL], ["p_type", "Config"], ["question_id", question_id]]
        });
    };
    
    this.config_open_poll = function(){
        var question_id = 0;
        var my_URL = window.location.pathname;
        
        $().SPServices({
            operation: "GetListItems",
            async: false,
            listName: this.poll_list,
            CAMLViewFields: "<ViewFields><FieldRef Name='question_id' /></ViewFields>",
            CAMLQuery: "<Query><Where><Eq><FieldRef Name='Title' /><Value Type='Text'>"+ my_URL +
    			"</Value></Eq></Where></Query>",
            completefunc: function (xData, Status) {
                $(xData.responseXML).SPFilterNode("z:row").each(function() {
                    question_id = $(this).attr("ows_question_id");
                });
            }
        });
        
        if(question_id)
        {
            return this.open_poll(question_id);   
        }
        else
        {
            
        }
    };
	
	this.get_questions();
}

function SP_Poll(sp_poll_connection)
{
	this.question_id = undefined;
	this.sp_poll_connection = sp_poll_connection;
	this.question_text = "";
	this.choices = [];
	//this.votes = [];
	this.opened = false;
		
	this.add_choice = function add_choice(choice){
		this.choices.push(choice);
	};
	
	this.set_question = function set_question(question_text){
		this.question_text = question_text;
	};
	
	this.save = function save(){
		if(this.question_text == "" || this.choices.length == 0)
		{
			throw "Attempted to save an incomplete poll, check if it has question text and choices";
		}
		else
		{
			var updates = '<Batch OnError="Continue">';
			updates += '<Method ID="1" Cmd="New"><Field Name="Title">'+this.question_text+'</Field><Field Name="p_type">Question</Field><Field Name="question_id">'+this.question_id+'</Field></Method>';
			for (var i = 0; i < this.choices.length; i++)
			{
				updates += '<Method ID="'+(i+2)+'" Cmd="New"><Field Name="Title">'+this.choices[i].choice_text+'</Field><Field Name="p_type">Choice</Field><Field Name="question_id">'+this.question_id+'</Field></Method>';
			}
			updates += '</Batch>';

            $().SPServices({
                operation: "UpdateListItems",
                async: false,
                listName: sp_poll_connection.poll_list,
                updates: updates
            });
            this.opened = true;
            this.sp_poll_connection.get_questions();
		}
	};
	
	this.vote = function vote(choice_text){
		if(this.already_voted())
		{
			throw "User has already voted in this poll";
		}
		else if(!this.opened)
		{
			throw "Cannot vote on a poll that is not opened";
		}
		else
		{
            $().SPServices({
                operation: "UpdateListItems",
                async: false,
                batchCmd: "New",
                listName: sp_poll_connection.poll_data,
                valuepairs: [["Title", choice_text], ["question_id", this.question_id]]
            });
		}
	};
	
	this.already_voted = function already_voted(){
		var last_item_id = $().SPServices.SPGetLastItemId({	
			listName: this.sp_poll_connection.poll_data,
			CAMLQuery: "<Eq><FieldRef Name='question_id'/><Value Type='Counter'>"+this.question_id+"</Value></Eq>"
		});
		if(last_item_id > 0)
		{
			return true;
		}
		else
		{
			return false;
		}
		return false;
	};
	
	this.get_votes = function() {
		var this_poll= this;
		var choices_text = [];
		for(var i = 0; i < this_poll.choices.length; i++)
		{
			this_poll.choices[i].votes = 0;
			choices_text.push(this_poll.choices[i].choice_text);
		}
        $().SPServices({
            operation: "GetListItems",
            async: false,
            listName: this_poll.sp_poll_connection.poll_data,
            CAMLViewFields: "<ViewFields><FieldRef Name='Title' /></ViewFields>",
            CAMLQuery: "<Query><Where><Eq><FieldRef Name='question_id' /><Value Type='Counter'>"+this_poll.question_id+
                "</Value></Eq></Where></Query>",
            completefunc: function (xData, Status) {
                $(xData.responseXML).SPFilterNode("z:row").each(function() {
                    this_poll.choices[$.inArray( $(this).attr("ows_Title") , choices_text )].votes++;
		      	});
            }
        });
	};
}

function Choice(choice_text,votes){
	this.choice_text = choice_text;
	this.votes = votes;
}

function Poll_Display(poll_element, sp_poll)
{
	this.poll_container = poll_element;
	this.sp_poll = sp_poll;
	
	//Time to build the divs
	this.poll_vote = $('<div id="poll_vote"><div id="question_text" style="margin-bottom:20px"></div><div id="choices"></div><div style="text-align:right;margin-right:30px"><input type="button" id="vote" value="Vote" /></div></div>');
	this.poll_results = $('<div id="poll_results"></div>');
	this.poll_admin = $('<div id="poll_admin">Question:<select id="question_select"></select><a href="" id="add_question">+</a><div id="choice_inputs"></div></div>');
	this.top = undefined;
	this.poll_container.css({"overflow":"hidden","position":"relative"});
	
	this.hide_all = function(){
		//var background_body = $("body").css("background-color");
		var starting_css = {"display":"none","position":"absolute","height":"100%","width":"95%","z-index":"1","background-color":"white"};
		this.poll_vote.css(starting_css);
		this.poll_results .css(starting_css);
		this.poll_admin .css(starting_css);
	};
	
	this.remove_top = function(){
		if(this.top != undefined)
		{
			this.top.css("z-index","2");
			this.top.animate({left:"+200px"},function() { 
				$(this).css({"z-index":"1","display":"none","left":"0px"});
			});
		}
	};
	this.show_vote = function(){
		this.remove_top();
		this.poll_vote.css("display","block");
		this.top = this.poll_vote;
	};
	this.show_results = function(){
		this.remove_top();
		this.poll_results.css("display","block");
		this.top = this.poll_results;
		this.animate_bars();
	};
	this.show_admin = function(){
		this.remove_top();
		this.poll_admin.css("display","block");
		this.top = this.poll_admin;
	};
	
	this.load_vote = function(){
		$("#question_text").text(this.sp_poll.question_text);
		for(var i = 0; i < this.sp_poll.choices.length ; i++)
		{
			$("#choices").append('<input type="radio" name="vote_choices" value="' + this.sp_poll.choices[i].choice_text + '">' + this.sp_poll.choices[i].choice_text + '<br />' );
		}
	};
	
	this.load_results = function(){
		//$("#question_text_r").text(this.sp_poll.question_text);
		this.sp_poll.get_votes();
		this.poll_results.html("");
		
		var choice_disp = [];
		var choice_separator = " - ";
		var total = 0;
		var bar_height = 15;
		var percent = 0;
		var append_string = "";
        var i;
		
		for(i = 0; i < this.sp_poll.choices.length ; i++)
		{
			choice_disp.push(this.sp_poll.choices[i].choice_text + choice_separator);
			total += this.sp_poll.choices[i].votes;
			//$("#vote_results").append(this.sp_poll.choices[i].choice_text + " " + this.sp_poll.choices[i].votes + "<br>");
		}
		
		this.poll_results.append('<div style="margin-bottom:20px">' + this.sp_poll.question_text + '</div>');
		
		for(i = 0; i < choice_disp.length; i++)
		{
			if(total > 0)
			{
				percent = Math.round( (this.sp_poll.choices[i].votes / total) * 100 )
				choice_disp[i] += percent + "%";
				append_string = '<div>' + choice_disp[i] + '</div>';
				append_string += '<div style="height:' + (bar_height + 0) +'px;border-style:solid;border-width:thin;border-color:gray;padding:2px">';
				append_string += '<div name="percent_bar" style="background-color:blue;height:' + bar_height +'px;width:' + percent + '%;"></div></div>';
				this.poll_results.append(append_string);
			}
		}
		this.poll_results.append('<div style="text-align:right;margin-right:10px">Total Votes: ' + total + '</div>');
		
	};
	
	this.animate_bars = function(){
		var bars = $("[name='percent_bar']");
		var max_width = 0;
		var widths = [];
		var this_width;
		var this_duration;
		var base_duration = 1000;
		
		bars.each(function(){
			this_width= $(this).width();
			widths.push(this_width);
			if(this_width> max_width)
			{
				max_width= this_width;
			}
			$(this).width(0);
		});
		
		bars.each(function(index){
			this_duration = Math.round( ( widths[index] / max_width ) * base_duration );
			$(this).animate( {"width":widths[index] + "px"}, this_duration, "linear");
		});
		
		
	};

	this.hide_all();
    this.poll_container.html("");
	this.poll_container.append(this.poll_vote,this.poll_results,this.poll_admin);
	var this_display = this;
	
	$("#vote").click(function(){
		var vote_val = $("[name='vote_choices']:checked").val();
		if(vote_val != undefined)
		{
			this_display.sp_poll.vote(vote_val);
			this_display.load_results();
			this_display.show_results();
		}
	});
}